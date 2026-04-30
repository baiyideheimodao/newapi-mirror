package model

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"

	"gorm.io/gorm"
)

// ErrRedeemFailed is returned when redemption fails due to database error.
var ErrRedeemFailed = errors.New("redeem.failed")

const (
	RedemptionRewardTypeQuota        = "quota"
	RedemptionRewardTypeSubscription = "subscription"
)

type RedeemResult struct {
	RewardType string `json:"reward_type"`
	Quota      int    `json:"quota"`
	PlanId     int    `json:"plan_id"`
	PlanTitle  string `json:"plan_title"`
}

type Redemption struct {
	Id           int            `json:"id"`
	UserId       int            `json:"user_id"`
	Key          string         `json:"key" gorm:"type:char(32);uniqueIndex"`
	Status       int            `json:"status" gorm:"default:1"`
	Name         string         `json:"name" gorm:"index"`
	Quota        int            `json:"quota" gorm:"default:100"`
	RewardType   string         `json:"reward_type" gorm:"type:varchar(16);not null;default:'quota'"`
	PlanId       int            `json:"plan_id" gorm:"default:0"`
	CreatedTime  int64          `json:"created_time" gorm:"bigint"`
	RedeemedTime int64          `json:"redeemed_time" gorm:"bigint"`
	Count        int            `json:"count" gorm:"-:all"` // only for api request
	UsedUserId   int            `json:"used_user_id"`
	DeletedAt    gorm.DeletedAt `gorm:"index"`
	ExpiredTime  int64          `json:"expired_time" gorm:"bigint"` // 0 means never expires
}

func NormalizeRedemptionRewardType(rewardType string) string {
	switch strings.TrimSpace(rewardType) {
	case RedemptionRewardTypeSubscription:
		return RedemptionRewardTypeSubscription
	default:
		return RedemptionRewardTypeQuota
	}
}

func (redemption *Redemption) NormalizeReward() {
	if redemption == nil {
		return
	}
	redemption.RewardType = NormalizeRedemptionRewardType(redemption.RewardType)
	if redemption.RewardType == RedemptionRewardTypeQuota {
		redemption.PlanId = 0
	}
}

func normalizeRedemptions(redemptions []*Redemption) {
	for _, redemption := range redemptions {
		redemption.NormalizeReward()
	}
}

func GetAllRedemptions(startIdx int, num int) (redemptions []*Redemption, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	err = tx.Model(&Redemption{}).Count(&total).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	err = tx.Order("id desc").Limit(num).Offset(startIdx).Find(&redemptions).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}

	normalizeRedemptions(redemptions)
	return redemptions, total, nil
}

func SearchRedemptions(keyword string, startIdx int, num int) (redemptions []*Redemption, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	query := tx.Model(&Redemption{})
	if id, convErr := strconv.Atoi(keyword); convErr == nil {
		query = query.Where("id = ? OR name LIKE ?", id, keyword+"%")
	} else {
		query = query.Where("name LIKE ?", keyword+"%")
	}

	err = query.Count(&total).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	err = query.Order("id desc").Limit(num).Offset(startIdx).Find(&redemptions).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}

	normalizeRedemptions(redemptions)
	return redemptions, total, nil
}

func GetRedemptionById(id int) (*Redemption, error) {
	if id == 0 {
		return nil, errors.New("id is empty")
	}
	redemption := Redemption{Id: id}
	err := DB.First(&redemption, "id = ?", id).Error
	redemption.NormalizeReward()
	return &redemption, err
}

func Redeem(key string, userId int) (result *RedeemResult, err error) {
	if key == "" {
		return nil, errors.New("redemption code is required")
	}
	if userId == 0 {
		return nil, errors.New("invalid user id")
	}

	redemption := &Redemption{}
	result = &RedeemResult{}
	upgradeGroup := ""

	keyCol := "`key`"
	if common.UsingPostgreSQL {
		keyCol = `"key"`
	}

	common.RandomSleep()
	err = DB.Transaction(func(tx *gorm.DB) error {
		lockErr := tx.Set("gorm:query_option", "FOR UPDATE").Where(keyCol+" = ?", key).First(redemption).Error
		if lockErr != nil {
			return errors.New("invalid redemption code")
		}

		redemption.NormalizeReward()

		if redemption.Status != common.RedemptionCodeStatusEnabled {
			return errors.New("redemption code has already been used")
		}
		if redemption.ExpiredTime != 0 && redemption.ExpiredTime < common.GetTimestamp() {
			return errors.New("redemption code has expired")
		}

		result.RewardType = redemption.RewardType
		switch redemption.RewardType {
		case RedemptionRewardTypeSubscription:
			if redemption.PlanId <= 0 {
				return errors.New("subscription redemption code is not configured with a plan")
			}
			plan, planErr := getSubscriptionPlanByIdTx(tx, redemption.PlanId)
			if planErr != nil {
				return errors.New("subscription plan not found")
			}
			_, createErr := CreateUserSubscriptionFromPlanTx(tx, userId, plan, "redemption")
			if createErr != nil {
				return createErr
			}
			result.PlanId = plan.Id
			result.PlanTitle = plan.Title
			upgradeGroup = strings.TrimSpace(plan.UpgradeGroup)
		default:
			updateErr := tx.Model(&User{}).Where("id = ?", userId).Update("quota", gorm.Expr("quota + ?", redemption.Quota)).Error
			if updateErr != nil {
				return updateErr
			}
			result.Quota = redemption.Quota
		}

		redemption.RedeemedTime = common.GetTimestamp()
		redemption.Status = common.RedemptionCodeStatusUsed
		redemption.UsedUserId = userId
		return tx.Save(redemption).Error
	})
	if err != nil {
		common.SysError("redemption failed: " + err.Error())
		return nil, ErrRedeemFailed
	}

	if upgradeGroup != "" {
		_ = UpdateUserGroupCache(userId, upgradeGroup)
	}

	if result.RewardType == RedemptionRewardTypeSubscription {
		RecordLog(userId, LogTypeTopup, fmt.Sprintf("通过兑换码获得订阅套餐 %s，兑换码ID %d", result.PlanTitle, redemption.Id))
	} else {
		RecordLog(userId, LogTypeTopup, fmt.Sprintf("通过兑换码充值 %s，兑换码ID %d", logger.LogQuota(result.Quota), redemption.Id))
	}
	return result, nil
}

func (redemption *Redemption) Insert() error {
	redemption.NormalizeReward()
	return DB.Create(redemption).Error
}

func (redemption *Redemption) SelectUpdate() error {
	return DB.Model(redemption).Select("redeemed_time", "status").Updates(redemption).Error
}

// Update updates editable fields on a redemption code.
func (redemption *Redemption) Update() error {
	redemption.NormalizeReward()
	return DB.Model(redemption).Select(
		"name",
		"status",
		"quota",
		"reward_type",
		"plan_id",
		"redeemed_time",
		"expired_time",
	).Updates(redemption).Error
}

func (redemption *Redemption) Delete() error {
	return DB.Delete(redemption).Error
}

func DeleteRedemptionById(id int) error {
	if id == 0 {
		return errors.New("id is empty")
	}
	redemption := Redemption{Id: id}
	err := DB.Where(redemption).First(&redemption).Error
	if err != nil {
		return err
	}
	return redemption.Delete()
}

func DeleteInvalidRedemptions() (int64, error) {
	now := common.GetTimestamp()
	result := DB.Where(
		"status IN ? OR (status = ? AND expired_time != 0 AND expired_time < ?)",
		[]int{common.RedemptionCodeStatusUsed, common.RedemptionCodeStatusDisabled},
		common.RedemptionCodeStatusEnabled,
		now,
	).Delete(&Redemption{})
	return result.RowsAffected, result.Error
}
