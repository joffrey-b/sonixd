import React, { useEffect, useRef, useState } from 'react';
import { ButtonToolbar } from 'rsuite';
import { useTranslation } from 'react-i18next';
import { ConfigPanel } from '../styled';
import {
  StyledButton,
  StyledInputNumber,
  StyledInputPicker,
  StyledInputPickerContainer,
  StyledToggle,
} from '../../shared/styled';
import { useAppDispatch, useAppSelector } from '../../../redux/hooks';
import { setPlaybackSetting } from '../../../redux/playQueueSlice';
import { setAudioDeviceId } from '../../../redux/configSlice';
import { notifyToast } from '../../shared/toast';
import ConfigOption from '../ConfigOption';
import { settings } from '../../shared/setDefaultSettings';

const getAudioDevice = async () => {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return (devices || []).filter((dev: MediaDeviceInfo) => dev.kind === 'audiooutput');
};

const PlaybackConfig = ({ bordered }: any) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const config = useAppSelector((state) => state.config);
  const [crossfadeDuration, setCrossfadeDuration] = useState(Number(settings.get('fadeDuration')));
  const [pollingInterval, setPollingInterval] = useState(Number(settings.get('pollingInterval')));
  const [volumeFade, setVolumeFade] = useState(Boolean(settings.get('volumeFade')));
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>();
  const crossfadePickerContainerRef = useRef(null);
  const audioDevicePickerContainerRef = useRef(null);

  useEffect(() => {
    const refreshAudioDevices = () => {
      getAudioDevice()
        .then((dev) => {
          setAudioDevices(dev);
          if (
            config.playback.audioDeviceId &&
            !dev.find((d) => d.deviceId === config.playback.audioDeviceId)
          ) {
            notifyToast(
              'warning',
              t('Selected audio device is no longer available. Using system default.')
            );
          }
          return null;
        })
        .catch(() => notifyToast('error', t('Error fetching audio devices')));
    };

    refreshAudioDevices();
    navigator.mediaDevices.addEventListener('devicechange', refreshAudioDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refreshAudioDevices);
  }, [t, config.playback.audioDeviceId]);

  const handleSetCrossfadeDuration = (e: number) => {
    setCrossfadeDuration(e);
    settings.set('fadeDuration', Number(e));
    dispatch(
      setPlaybackSetting({
        setting: 'fadeDuration',
        value: Number(e),
      })
    );
  };

  const handleSetPollingInterval = (e: number) => {
    setPollingInterval(e);
    settings.set('pollingInterval', Number(e));
    dispatch(
      setPlaybackSetting({
        setting: 'pollingInterval',
        value: Number(e),
      })
    );
  };

  const handleSetVolumeFade = (e: boolean) => {
    setVolumeFade(e);
    settings.set('volumeFade', e);
    dispatch(setPlaybackSetting({ setting: 'volumeFade', value: e }));
  };

  return (
    <>
      <ConfigPanel bordered={bordered} header={t('Playback')}>
        <ConfigOption
          name={t('Crossfade Duration (s)')}
          description={t(
            'The number in seconds before starting the crossfade to the next track. Setting this to 0 will enable gapless playback.'
          )}
          option={
            <StyledInputNumber
              defaultValue={crossfadeDuration}
              value={crossfadeDuration}
              step={0.05}
              min={0}
              max={100}
              width={125}
              onChange={(e: number) => handleSetCrossfadeDuration(e)}
            />
          }
        />

        <ConfigOption
          name={t('Polling Interval')}
          description={t(
            'The number in milliseconds between each poll when music is playing. This is used in the calculation for crossfading and gapless playback. Recommended value for gapless playback is between 10 and 20.'
          )}
          option={
            <StyledInputNumber
              defaultValue={pollingInterval}
              value={pollingInterval}
              step={1}
              min={1}
              max={1000}
              width={125}
              onChange={(e: number) => handleSetPollingInterval(e)}
            />
          }
        />

        <ConfigOption
          name={t('Crossfade Type')}
          description={t('The fade calculation to use when crossfading between two tracks.')}
          option={
            <StyledInputPickerContainer ref={crossfadePickerContainerRef}>
              <StyledInputPicker
                container={() => crossfadePickerContainerRef.current}
                data={[
                  {
                    label: t('Equal Power'),
                    value: 'equalPower',
                  },
                  {
                    label: t('Linear'),
                    value: 'linear',
                  },
                  {
                    label: t('Dipped'),
                    value: 'dipped',
                  },
                  {
                    label: t('Constant Power'),
                    value: 'constantPower',
                  },
                  {
                    label: t('Constant Power (slow fade)'),
                    value: 'constantPowerSlowFade',
                  },
                  {
                    label: t('Constant Power (slow cut)'),
                    value: 'constantPowerSlowCut',
                  },
                  {
                    label: t('Constant Power (fast cut)'),
                    value: 'constantPowerFastCut',
                  },
                ]}
                cleanable={false}
                defaultValue={String(settings.get('fadeType'))}
                placeholder={t('Select')}
                onChange={(e: string) => {
                  settings.set('fadeType', e);
                  dispatch(setPlaybackSetting({ setting: 'fadeType', value: e }));
                }}
                width={200}
              />
            </StyledInputPickerContainer>
          }
        />

        <ConfigOption
          name={t('Volume Fade')}
          description={t(
            'Enable or disable the volume fade used by the crossfading players. If disabled, the fading in track will start at full volume.'
          )}
          option={
            <StyledToggle
              size="md"
              defaultChecked={volumeFade}
              checked={volumeFade}
              disabled={crossfadeDuration === 0}
              onChange={(e: boolean) => handleSetVolumeFade(e)}
            />
          }
        />

        <ConfigOption
          name={t('Playback Presets')}
          description={t("Don't know where to start? Apply a preset and tweak from there.")}
          option={
            <ButtonToolbar>
              <StyledButton
                onClick={() => {
                  setCrossfadeDuration(0);
                  setPollingInterval(10);
                  handleSetCrossfadeDuration(0);
                  handleSetPollingInterval(10);
                }}
              >
                {t('Gapless')}
              </StyledButton>
              <StyledButton
                onClick={() => {
                  setCrossfadeDuration(7);
                  setPollingInterval(50);
                  setVolumeFade(true);
                  handleSetCrossfadeDuration(7);
                  handleSetPollingInterval(50);
                  handleSetVolumeFade(true);
                }}
              >
                {t('Fade')}
              </StyledButton>
            </ButtonToolbar>
          }
        />

        <ConfigOption
          name={t('Audio Device')}
          description={t(
            'The audio device for Sonixd. Leaving this blank will use the system default.'
          )}
          option={
            <StyledInputPickerContainer ref={audioDevicePickerContainerRef}>
              <StyledInputPicker
                container={() => audioDevicePickerContainerRef.current}
                data={audioDevices}
                defaultValue={config.playback.audioDeviceId}
                value={config.playback.audioDeviceId}
                labelKey="label"
                valueKey="deviceId"
                placement="bottomStart"
                placeholder={t('Select')}
                onChange={(e: string) => {
                  dispatch(setAudioDeviceId(e));
                  settings.set('audioDeviceId', e);
                }}
              />
            </StyledInputPickerContainer>
          }
        />
      </ConfigPanel>
    </>
  );
};

export default PlaybackConfig;
