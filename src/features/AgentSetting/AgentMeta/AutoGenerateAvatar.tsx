import { Avatar as A, ActionIcon } from '@lobehub/ui';
import { Upload } from 'antd';
import { useTheme } from 'antd-style';
import { Wand2 } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Flexbox } from 'react-layout-kit';

import { fetchErrorNotification } from '@/components/Error/fetchErrorNotification';
import { imageToBase64 } from '@/utils/imageToBase64';
import { createUploadImageHandler } from '@/utils/uploadFIle';

export interface AutoGenerateAvatarProps {
  background?: string;
  canAutoGenerate?: boolean;
  loading?: boolean;
  onChange?: (value: string) => void;
  onGenerate?: () => void;
  value?: string;
}

const AutoGenerateAvatar = memo<AutoGenerateAvatarProps>(
  ({ loading, background, value, onChange, onGenerate, canAutoGenerate }) => {
    const { t } = useTranslation('common');
    const theme = useTheme();
    const [uploading, setUploading] = useState(false);

    const handleUploadAvatar = useCallback(
      createUploadImageHandler(async (avatar) => {
        try {
          setUploading(true);

          const img = new Image();
          img.src = avatar;

          await new Promise((resolve, reject) => {
            img.addEventListener('load', resolve);
            img.addEventListener('error', reject);
          });

          const webpBase64 = imageToBase64({ img, size: 256 });

          onChange?.(webpBase64);
        } catch (error) {
          console.error('Failed to upload agent avatar:', error);

          fetchErrorNotification.error({
            errorMessage: error instanceof Error ? error.message : String(error),
            status: 500,
          });
        } finally {
          setUploading(false);
        }
      }),
      [onChange],
    );

    const finalAvatar = value || '🤖';
    const isLoading = !!loading || uploading;

    return (
      <Flexbox
        align={'center'}
        flex={'none'}
        gap={2}
        horizontal
        padding={2}
        style={{
          background: theme.colorBgContainer,
          border: `1px solid ${theme.colorBorderSecondary}`,
          borderRadius: 32,
          paddingRight: 8,
          width: 'fit-content',
        }}
      >
        <Upload
          accept="image/*"
          beforeUpload={handleUploadAvatar}
          itemRender={() => void 0}
          maxCount={1}
          showUploadList={false}
        >
          <A
            alt={t('updateAgent')}
            animation={isLoading}
            avatar={finalAvatar}
            background={background || theme.colorFillTertiary}
            size={48}
            title={t('updateAgent')}
          />
        </Upload>
        <ActionIcon
          disabled={!canAutoGenerate}
          icon={Wand2}
          loading={isLoading}
          onClick={onGenerate}
          size="small"
          title={!canAutoGenerate ? t('autoGenerateTooltipDisabled') : t('autoGenerate')}
        />
      </Flexbox>
    );
  },
);

export default AutoGenerateAvatar;
