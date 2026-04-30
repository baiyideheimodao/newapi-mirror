/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  API,
  downloadTextAsFile,
  renderQuota,
  renderQuotaWithPrompt,
  showError,
  showSuccess,
} from '../../../../helpers';
import { useIsMobile } from '../../../../hooks/common/useIsMobile';
import {
  Avatar,
  Button,
  Card,
  Col,
  Form,
  Modal,
  Row,
  SideSheet,
  Space,
  Spin,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IconClose,
  IconCreditCard,
  IconGift,
  IconSave,
} from '@douyinfe/semi-icons';

const { Text, Title } = Typography;

const REWARD_TYPE_QUOTA = 'quota';
const REWARD_TYPE_SUBSCRIPTION = 'subscription';

const EditRedemptionModal = (props) => {
  const { t } = useTranslation();
  const isEdit = props.editingRedemption.id !== undefined;
  const isMobile = useIsMobile();
  const formApiRef = useRef(null);

  const [loading, setLoading] = useState(isEdit);
  const [plansLoading, setPlansLoading] = useState(false);
  const [subscriptionPlans, setSubscriptionPlans] = useState([]);

  const getInitValues = () => ({
    name: '',
    reward_type: REWARD_TYPE_QUOTA,
    quota: 100000,
    plan_id: 0,
    count: 1,
    expired_time: null,
  });

  const planOptions = useMemo(() => {
    return (subscriptionPlans || []).map((item) => ({
      label: item?.plan?.title || `#${item?.plan?.id}`,
      value: item?.plan?.id,
    }));
  }, [subscriptionPlans]);

  const handleCancel = () => {
    props.handleClose();
  };

  const loadSubscriptionPlans = async () => {
    setPlansLoading(true);
    try {
      const res = await API.get('/api/subscription/admin/plans');
      if (res.data?.success) {
        setSubscriptionPlans(res.data?.data || []);
      } else {
        showError(res.data?.message || t('加载套餐失败'));
      }
    } catch (error) {
      showError(t('加载套餐失败'));
    } finally {
      setPlansLoading(false);
    }
  };

  const loadRedemption = async () => {
    setLoading(true);
    try {
      const res = await API.get(`/api/redemption/${props.editingRedemption.id}`);
      const { success, message, data } = res.data;
      if (success) {
        const formValues = {
          ...getInitValues(),
          ...data,
          reward_type: data?.reward_type || REWARD_TYPE_QUOTA,
          plan_id: Number(data?.plan_id || 0),
          quota: Number(data?.quota || 0),
        };
        if (formValues.expired_time === 0) {
          formValues.expired_time = null;
        } else if (formValues.expired_time) {
          formValues.expired_time = new Date(formValues.expired_time * 1000);
        }
        formApiRef.current?.setValues(formValues);
      } else {
        showError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (props.visiable) {
      loadSubscriptionPlans();
    }
  }, [props.visiable]);

  useEffect(() => {
    if (!formApiRef.current) return;
    if (isEdit) {
      loadRedemption();
    } else {
      formApiRef.current.setValues(getInitValues());
    }
  }, [props.editingRedemption.id]);

  const submit = async (values) => {
    let name = values.name;
    if (!isEdit && (!name || name === '')) {
      if (values.reward_type === REWARD_TYPE_SUBSCRIPTION) {
        const selectedPlan = subscriptionPlans.find(
          (item) => item?.plan?.id === Number(values.plan_id || 0),
        );
        name = selectedPlan?.plan?.title || t('订阅套餐兑换码');
      } else {
        name = renderQuota(values.quota);
      }
    }

    setLoading(true);
    try {
      const localInputs = {
        ...values,
        count: parseInt(values.count, 10) || 0,
        reward_type: values.reward_type || REWARD_TYPE_QUOTA,
        quota: parseInt(values.quota, 10) || 0,
        plan_id: parseInt(values.plan_id, 10) || 0,
        name,
        expired_time: values.expired_time
          ? Math.floor(values.expired_time.getTime() / 1000)
          : 0,
      };

      if (localInputs.reward_type === REWARD_TYPE_SUBSCRIPTION) {
        localInputs.quota = 0;
      } else {
        localInputs.plan_id = 0;
      }

      let res;
      if (isEdit) {
        res = await API.put('/api/redemption/', {
          ...localInputs,
          id: parseInt(props.editingRedemption.id, 10),
        });
      } else {
        res = await API.post('/api/redemption/', localInputs);
      }

      const { success, message, data } = res.data;
      if (!success) {
        showError(message);
        return;
      }

      if (isEdit) {
        showSuccess(t('兑换码更新成功！'));
      } else {
        showSuccess(t('兑换码创建成功！'));
      }

      props.refresh();
      formApiRef.current?.setValues(getInitValues());
      props.handleClose();

      if (!isEdit && data) {
        const text = (data || []).join('\n') + '\n';
        Modal.confirm({
          title: t('兑换码创建成功！'),
          content: (
            <div>
              <p>{t('兑换码创建成功，是否下载兑换码？')}</p>
              <p>{t('兑换码将以文本文件的形式下载，文件名为兑换码的名称。')}</p>
            </div>
          ),
          onOk: () => {
            downloadTextAsFile(text, `${localInputs.name}.txt`);
          },
        });
      }
    } catch (error) {
      showError(t('请求失败'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <SideSheet
        placement={isEdit ? 'right' : 'left'}
        title={
          <Space>
            {isEdit ? (
              <Tag color='blue' shape='circle'>
                {t('更新')}
              </Tag>
            ) : (
              <Tag color='green' shape='circle'>
                {t('新建')}
              </Tag>
            )}
            <Title heading={4} className='m-0'>
              {isEdit ? t('更新兑换码信息') : t('创建新的兑换码')}
            </Title>
          </Space>
        }
        bodyStyle={{ padding: '0' }}
        visible={props.visiable}
        width={isMobile ? '100%' : 600}
        footer={
          <div className='flex justify-end bg-white'>
            <Space>
              <Button
                theme='solid'
                onClick={() => formApiRef.current?.submitForm()}
                icon={<IconSave />}
                loading={loading}
              >
                {t('提交')}
              </Button>
              <Button
                theme='light'
                type='primary'
                onClick={handleCancel}
                icon={<IconClose />}
              >
                {t('取消')}
              </Button>
            </Space>
          </div>
        }
        closeIcon={null}
        onCancel={handleCancel}
      >
        <Spin spinning={loading}>
          <Form
            initValues={getInitValues()}
            getFormApi={(api) => {
              formApiRef.current = api;
            }}
            onSubmit={submit}
          >
            {({ values }) => (
              <div className='p-2'>
                <Card className='!rounded-2xl shadow-sm border-0 mb-6'>
                  <div className='flex items-center mb-2'>
                    <Avatar size='small' color='blue' className='mr-2 shadow-md'>
                      <IconGift size={16} />
                    </Avatar>
                    <div>
                      <Text className='text-lg font-medium'>
                        {t('基本信息')}
                      </Text>
                      <div className='text-xs text-gray-600'>
                        {t('设置兑换码的基本信息')}
                      </div>
                    </div>
                  </div>

                  <Row gutter={12}>
                    <Col span={24}>
                      <Form.Input
                        field='name'
                        label={t('名称')}
                        placeholder={t('请输入名称')}
                        style={{ width: '100%' }}
                        rules={
                          !isEdit
                            ? []
                            : [{ required: true, message: t('请输入名称') }]
                        }
                        showClear
                      />
                    </Col>
                    <Col span={24}>
                      <Form.Select
                        field='reward_type'
                        label={t('兑换功能')}
                        style={{ width: '100%' }}
                      >
                        <Form.Select.Option value={REWARD_TYPE_QUOTA}>
                          {t('绑定余额')}
                        </Form.Select.Option>
                        <Form.Select.Option value={REWARD_TYPE_SUBSCRIPTION}>
                          {t('绑定套餐')}
                        </Form.Select.Option>
                      </Form.Select>
                    </Col>
                    <Col span={24}>
                      <Form.DatePicker
                        field='expired_time'
                        label={t('过期时间')}
                        type='dateTime'
                        placeholder={t('选择过期时间（可选，留空为永久）')}
                        style={{ width: '100%' }}
                        showClear
                      />
                    </Col>
                  </Row>
                </Card>

                <Card className='!rounded-2xl shadow-sm border-0'>
                  <div className='flex items-center mb-2'>
                    <Avatar size='small' color='green' className='mr-2 shadow-md'>
                      <IconCreditCard size={16} />
                    </Avatar>
                    <div>
                      <Text className='text-lg font-medium'>
                        {t('权益设置')}
                      </Text>
                      <div className='text-xs text-gray-600'>
                        {t('设置兑换码绑定余额或套餐')}
                      </div>
                    </div>
                  </div>

                  <Row gutter={12}>
                    <Col span={12}>
                      {values.reward_type === REWARD_TYPE_SUBSCRIPTION ? (
                        <Form.Select
                          field='plan_id'
                          label={t('订阅套餐')}
                          placeholder={t('请选择订阅套餐')}
                          style={{ width: '100%' }}
                          loading={plansLoading}
                          optionList={planOptions}
                          rules={[
                            {
                              required: true,
                              message: t('请选择订阅套餐'),
                            },
                          ]}
                        />
                      ) : (
                        <Form.AutoComplete
                          field='quota'
                          label={t('额度')}
                          placeholder={t('请输入额度')}
                          style={{ width: '100%' }}
                          type='number'
                          rules={[
                            { required: true, message: t('请输入额度') },
                            {
                              validator: (rule, v) => {
                                const num = parseInt(v, 10);
                                return num > 0
                                  ? Promise.resolve()
                                  : Promise.reject(t('额度必须大于0'));
                              },
                            },
                          ]}
                          extraText={renderQuotaWithPrompt(
                            Number(values.quota) || 0,
                          )}
                          data={[
                            { value: 500000, label: '1$' },
                            { value: 5000000, label: '10$' },
                            { value: 25000000, label: '50$' },
                            { value: 50000000, label: '100$' },
                            { value: 250000000, label: '500$' },
                            { value: 500000000, label: '1000$' },
                          ]}
                          showClear
                        />
                      )}
                    </Col>
                    {!isEdit && (
                      <Col span={12}>
                        <Form.InputNumber
                          field='count'
                          label={t('生成数量')}
                          min={1}
                          rules={[
                            { required: true, message: t('请输入生成数量') },
                            {
                              validator: (rule, v) => {
                                const num = parseInt(v, 10);
                                return num > 0
                                  ? Promise.resolve()
                                  : Promise.reject(t('生成数量必须大于0'));
                              },
                            },
                          ]}
                          style={{ width: '100%' }}
                          showClear
                        />
                      </Col>
                    )}
                  </Row>
                </Card>
              </div>
            )}
          </Form>
        </Spin>
      </SideSheet>
    </>
  );
};

export default EditRedemptionModal;
