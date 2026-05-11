package service

import (
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

/*
User Linking Service - 用户表打通服务

此服务用于在 newapi (claude_admin) 和 claude 数据库之间建立用户关联关系。

使用场景：
1. 用户在 newapi 注册/登录后，自动在 claude 数据库中创建关联用户
2. 支持用户绑定已存在的 claude 用户

数据库关联方案：
- claude.users 表添加 newapi_user_id 字段 (bigint) 关联到 claude_admin.users.id
- 创建 newapi_user_links 表用于记录关联关系

使用流程：
1. 用户在 newapi 登录/注册成功
2. 调用 LinkNewapiUserToClaude(newapiUserId) 建立关联
3. 后续请求可以通过 newapiUserId 查询 claude 用户信息
*/

// ClaudeUserLink 用户关联信息
type ClaudeUserLink struct {
	CladueUserID   string    `json:"claude_user_id"`
	NewapiUserID   int       `json:"newapi_user_id"`
	LinkType       string    `json:"link_type"`
	CreatedAt      time.Time `json:"created_at"`
	ClaudeUsername string    `json:"claude_username"`
	ClaudeEmail    string    `json:"claude_email"`
}

// LinkNewapiUserToClaude 将 newapi 用户关联到 claude 用户
// 如果 claude 用户不存在，会自动创建一个
func LinkNewapiUserToClaude(newapiUserId int) (*ClaudeUserLink, error) {
	if model.CLAUDE_DB == nil {
		return nil, fmt.Errorf("Claude database not initialized")
	}

	// 获取 newapi 用户信息
	newapiUser, err := model.GetUserById(newapiUserId, false)
	if err != nil {
		return nil, fmt.Errorf("failed to get newapi user: %w", err)
	}

	// 检查是否已有关联
	existingLink, err := GetClaudeUserLinkByNewapiID(newapiUserId)
	if err == nil && existingLink != nil {
		common.SysLog(fmt.Sprintf("User %s already linked to Claude user %s", newapiUser.Username, existingLink.CladueUserID))
		return existingLink, nil
	}

	// 创建或获取 claude 用户
	claudeUser, err := getOrCreateClaudeUser(newapiUser)
	if err != nil {
		return nil, fmt.Errorf("failed to create Claude user: %w", err)
	}

	// 建立关联
	err = model.LinkUserToClaude(newapiUserId, claudeUser.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to link user: %w", err)
	}

	common.SysLog(fmt.Sprintf("Successfully linked newapi user %d to Claude user %s", newapiUserId, claudeUser.ID))

	return &ClaudeUserLink{
		CladueUserID:   claudeUser.ID,
		NewapiUserID:   newapiUserId,
		LinkType:       "primary",
		CreatedAt:      time.Now(),
		ClaudeUsername: claudeUser.Username,
		ClaudeEmail:    claudeUser.Email,
	}, nil
}

// getOrCreateClaudeUser 获取或创建 claude 数据库中的用户
func getOrCreateClaudeUser(newapiUser *model.User) (*model.ClaudeDBUser, error) {
	// 先尝试通过 newapi_user_id 查找
	existingUser, err := model.GetClaudeUserByNewapiUserId(newapiUser.Id)
	if err == nil && existingUser != nil {
		return existingUser, nil
	}

	// 如果没找到，创建一个新用户
	claudeUser := &model.ClaudeDBUser{
		ID:            generateUUID(), // Claude 使用 UUID
		Username:      newapiUser.Username,
		Email:         newapiUser.Email,
		PasswordHash:  newapiUser.Password, // 注意：这里只是存储，可能需要加密
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
		IsActive:      newapiUser.Status == 1,
		EmailVerified: newapiUser.Email != "",
		NewapiUserID:  newapiUser.Id,
		LinkedAt:      func() *time.Time { t := time.Now(); return &t }(),
	}

	// 创建用户
	err = model.CLAUDE_DB.Create(claudeUser).Error
	if err != nil {
		// 如果创建失败（可能是唯一约束冲突），尝试再次查找
		existingUser, err2 := model.GetClaudeUserByNewapiUserId(newapiUser.Id)
		if err2 == nil && existingUser != nil {
			return existingUser, nil
		}
		return nil, fmt.Errorf("failed to create Claude user: %w", err)
	}

	common.SysLog(fmt.Sprintf("Created new Claude user: %s (newapi_user_id: %d)", claudeUser.ID, newapiUser.Id))
	return claudeUser, nil
}

// GetClaudeUserLinkByNewapiID 根据 newapi 用户ID获取关联信息
func GetClaudeUserLinkByNewapiID(newapiUserId int) (*ClaudeUserLink, error) {
	if model.CLAUDE_DB == nil {
		return nil, fmt.Errorf("Claude database not initialized")
	}

	claudeUser, err := model.GetClaudeUserByNewapiUserId(newapiUserId)
	if err != nil {
		return nil, err
	}

	return &ClaudeUserLink{
		CladueUserID:   claudeUser.ID,
		NewapiUserID:   int(claudeUser.NewapiUserID),
		LinkType:       "primary",
		CreatedAt:      time.Now(),
		ClaudeUsername: claudeUser.Username,
		ClaudeEmail:    claudeUser.Email,
	}, nil
}

// GetClaudeUserLinkByClaudeID 根据 claude 用户ID获取关联信息
func GetClaudeUserLinkByClaudeID(claudeUserId string) (*ClaudeUserLink, error) {
	if model.CLAUDE_DB == nil {
		return nil, fmt.Errorf("Claude database not initialized")
	}

	var claudeUser model.ClaudeDBUser
	err := model.CLAUDE_DB.Where("id = ?", claudeUserId).First(&claudeUser).Error
	if err != nil {
		return nil, err
	}

	return &ClaudeUserLink{
		CladueUserID:   claudeUser.ID,
		NewapiUserID:   int(claudeUser.NewapiUserID),
		LinkType:       "primary",
		CreatedAt:      time.Now(),
		ClaudeUsername: claudeUser.Username,
		ClaudeEmail:    claudeUser.Email,
	}, nil
}

// GetClaudeUserByNewapiID 根据 newapi 用户ID获取 claude 用户信息
func GetClaudeUserByNewapiID(newapiUserId int) (*model.ClaudeDBUser, error) {
	return model.GetClaudeUserByNewapiUserId(newapiUserId)
}

// IsClaudeUserLinked 检查 newapi 用户是否已关联到 claude
func IsClaudeUserLinked(newapiUserId int) bool {
	_, err := GetClaudeUserLinkByNewapiID(newapiUserId)
	return err == nil
}

// SyncUserToClaude 同步 newapi 用户信息到 claude 数据库
func SyncUserToClaude(newapiUserId int) error {
	if model.CLAUDE_DB == nil {
		return fmt.Errorf("Claude database not initialized")
	}

	claudeUser, err := GetClaudeUserByNewapiID(newapiUserId)
	if err != nil {
		// 如果找不到，说明还没关联，先建立关联
		_, err = LinkNewapiUserToClaude(newapiUserId)
		return err
	}

	// 获取最新的 newapi 用户信息
	newapiUser, err := model.GetUserById(newapiUserId, false)
	if err != nil {
		return fmt.Errorf("failed to get newapi user: %w", err)
	}

	// 更新 claude 用户信息
	updates := map[string]interface{}{
		"username":       newapiUser.Username,
		"email":          newapiUser.Email,
		"updated_at":     time.Now(),
		"is_active":      newapiUser.Status == 1,
		"email_verified": newapiUser.Email != "",
	}

	return model.CLAUDE_DB.Model(&model.ClaudeDBUser{}).Where("id = ?", claudeUser.ID).Updates(updates).Error
}

// generateUUID 生成一个简单的UUID (简化版本，用于演示)
// 生产环境中应该使用专业的UUID库如 google/uuid
func generateUUID() string {
	return fmt.Sprintf("%04x%04x-%04x-%04x-%04x-%04x%04x%04x",
		time.Now().UnixNano()&0xffff,
		time.Now().UnixNano()>>16&0xffff,
		time.Now().UnixNano()>>32&0xffff,
		0x4000, // version 4
		0x8000|int64(time.Now().UnixNano()&0x3fff), // variant
		time.Now().UnixNano()>>48&0xffff,
		time.Now().UnixNano()>>32&0xff,
		time.Now().UnixNano()>>24&0xff,
	)
}
