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
import {
  Banner,
  Button,
  Card,
  Empty,
  Space,
  Spin,
  Typography,
} from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess } from '../../helpers';

const { Text, Title } = Typography;
const MAX_LOGO_SIZE = 512 * 1024;

const Website = () => {
  const { t } = useTranslation();
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoValue, setLogoValue] = useState('');
  const [savedLogoValue, setSavedLogoValue] = useState('');

  const loadOptions = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/option/');
      const { success, message, data } = res.data;
      if (!success) {
        showError(message);
        return;
      }

      const optionList = Array.isArray(data) ? data : [];
      const logoOption = optionList.find((item) => item.key === 'logo');
      const value = logoOption?.value || '';
      setLogoValue(value);
      setSavedLogoValue(value);
    } catch (error) {
      showError(t('加载失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOptions();
  }, []);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showError(t('请上传图片文件'));
      return;
    }

    if (file.size > MAX_LOGO_SIZE) {
      showError(t('Logo 文件不能超过 512KB'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setLogoValue(e.target?.result || '');
    };
    reader.onerror = () => {
      showError(t('读取图片失败'));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await API.put('/api/option/', {
        key: 'logo',
        value: logoValue || '',
      });
      const { success, message } = res.data;
      if (!success) {
        showError(message);
        return;
      }
      setSavedLogoValue(logoValue || '');
      showSuccess(t('保存成功'));
    } catch (error) {
      showError(t('保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const logoSizeText = useMemo(() => {
    if (!logoValue) return '';
    return `${(logoValue.length / 1024).toFixed(1)} KB`;
  }, [logoValue]);

  const hasChanges = logoValue !== savedLogoValue;

  return (
    <div className='mt-[60px] px-2'>
      <Spin spinning={loading || saving}>
        <div className='flex flex-col gap-4'>
          <Card>
            <Space
              vertical
              align='start'
              spacing='medium'
              style={{ width: '100%' }}
            >
              <div>
                <Title heading={5}>{t('网站管理')}</Title>
              </div>

              <div className='flex flex-wrap gap-2'>
                <input
                  ref={fileInputRef}
                  type='file'
                  accept='image/*'
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
                <Button onClick={() => fileInputRef.current?.click()}>
                  {logoValue ? t('重新上传 Logo') : t('上传 Logo')}
                </Button>
                <Button type='tertiary' onClick={() => setLogoValue('')}>
                  {t('清空当前配置')}
                </Button>
                <Button
                  type='secondary'
                  onClick={() => setLogoValue(savedLogoValue)}
                  disabled={!hasChanges}
                >
                  {t('恢复已保存内容')}
                </Button>
                <Button
                  theme='solid'
                  type='primary'
                  onClick={handleSave}
                  disabled={!hasChanges}
                >
                  {t('保存配置')}
                </Button>
              </div>

              <Text type='secondary'>
                {t('支持上传 PNG/JPG/WebP/SVG 等图片，建议控制在 512KB 以内。')}
                {logoSizeText ? ` ${t('当前大小')}: ${logoSizeText}` : ''}
              </Text>
            </Space>
          </Card>

          <Card title={t('Logo 预览')}>
            {logoValue ? (
              <div className='flex flex-col gap-3'>
                <div
                  style={{
                    minHeight: 220,
                    border: '1px dashed var(--semi-color-border)',
                    borderRadius: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background:
                      'linear-gradient(135deg, var(--semi-color-fill-0), var(--semi-color-fill-1))',
                    padding: 24,
                  }}
                >
                  <img
                    src={logoValue}
                    alt='website logo preview'
                    style={{
                      maxWidth: '100%',
                      maxHeight: 160,
                      objectFit: 'contain',
                    }}
                  />
                </div>
                <Text type='secondary'>
                  {t('当前保存键')}: <code>logo</code>
                </Text>
              </div>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                title={t('暂无 Logo 配置')}
                description={t(
                  '上传图片后保存，即可把 base64 写入 options 表中的 logo。',
                )}
              />
            )}
          </Card>
        </div>
      </Spin>
    </div>
  );
};

export default Website;
