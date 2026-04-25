import React, { useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { ConfigPanel } from '../styled';
import { useAppDispatch, useAppSelector } from '../../../redux/hooks';
import { setHotkey } from '../../../redux/configSlice';
import { settings } from '../../shared/setDefaultSettings';

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9em;
`;

const Th = styled.th`
  text-align: left;
  padding: 8px 12px;
  opacity: 0.5;
  font-weight: normal;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
`;

const Td = styled.td`
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
`;

const KeyBadge = styled.span<{ $listening: boolean }>`
  display: inline-block;
  padding: 3px 10px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 0.88em;
  background: ${(p) => (p.$listening ? 'rgba(33,150,243,0.3)' : 'rgba(255,255,255,0.08)')};
  border: 1px solid ${(p) => (p.$listening ? 'rgba(33,150,243,0.7)' : 'rgba(255,255,255,0.15)')};
  cursor: pointer;
  min-width: 140px;
  text-align: center;
  user-select: none;
`;

const SETTING_KEY_MAP: Record<string, string> = {
  navigateBack: 'hotkeyNavigateBack',
  search: 'hotkeySearch',
  selectAll: 'hotkeySelectAll',
  removeSelected: 'hotkeyRemoveSelected',
  playPause: 'hotkeyPlayPause',
  nextTrack: 'hotkeyNextTrack',
  prevTrack: 'hotkeyPrevTrack',
  volumeUp: 'hotkeyVolumeUp',
  volumeDown: 'hotkeyVolumeDown',
  mute: 'hotkeyMute',
};

function formatKey(key: string): string {
  return key
    .split('+')
    .map((part) => {
      if (part === 'ctrl') return 'Ctrl';
      if (part === 'alt') return 'Alt';
      if (part === 'shift') return 'Shift';
      if (part === 'meta') return 'Meta';
      if (part === 'del') return 'Delete';
      if (part === 'backspace') return 'Backspace';
      if (part === 'left') return '←';
      if (part === 'right') return '→';
      if (part === 'up') return '↑';
      if (part === 'down') return '↓';
      if (part === 'space') return 'Space';
      if (part === 'esc' || part === 'escape') return 'Esc';
      return part.toUpperCase();
    })
    .join(' + ');
}

function captureKey(e: React.KeyboardEvent): string | null {
  e.preventDefault();
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  if (e.metaKey) parts.push('meta');
  const key = e.key.toLowerCase();
  if (['control', 'alt', 'shift', 'meta'].includes(key)) return null;
  if (key === 'escape') return null; // escape cancels
  parts.push(
    key === ' '
      ? 'space'
      : key === 'delete'
      ? 'del'
      : key === 'arrowleft'
      ? 'left'
      : key === 'arrowright'
      ? 'right'
      : key === 'arrowup'
      ? 'up'
      : key === 'arrowdown'
      ? 'down'
      : key
  );
  return parts.join('+');
}

const KeyboardShortcutsConfig = ({ bordered }: any) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const hotkeys = useAppSelector((state) => state.config.hotkeys);
  const [listening, setListening] = useState<string | null>(null);

  const save = (action: string, key: string) => {
    dispatch(setHotkey({ action: action as any, key }));
    settings.set(SETTING_KEY_MAP[action], key);
    setListening(null);
  };

  const ROWS: Array<{ action: string; label: string }> = [
    { action: 'playPause', label: t('Play / Pause') },
    { action: 'nextTrack', label: t('Next Track') },
    { action: 'prevTrack', label: t('Previous Track') },
    { action: 'volumeUp', label: t('Volume Up') },
    { action: 'volumeDown', label: t('Volume Down') },
    { action: 'mute', label: t('Toggle Mute') },
    { action: 'navigateBack', label: t('Navigate Back') },
    { action: 'search', label: t('Open Search') },
    { action: 'selectAll', label: t('Select All') },
    { action: 'removeSelected', label: t('Remove Selected') },
  ];

  return (
    <ConfigPanel bordered={bordered} header={t('Keyboard Shortcuts')}>
      <p style={{ opacity: 0.55, fontSize: '0.85em', marginBottom: 12 }}>
        {t(
          'Click a shortcut to change it, then press the new key combination. Press Escape to cancel.'
        )}
      </p>
      <Table>
        <thead>
          <tr>
            <Th>{t('Action')}</Th>
            <Th>{t('Shortcut')}</Th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map(({ action, label }) => {
            const isListening = listening === action;
            const currentKey = hotkeys[action as keyof typeof hotkeys];
            return (
              <tr key={action}>
                <Td>{label}</Td>
                <Td>
                  <KeyBadge
                    $listening={isListening}
                    tabIndex={0}
                    onClick={() => setListening(isListening ? null : action)}
                    onKeyDown={(e) => {
                      if (!isListening) {
                        if (e.key === 'Enter' || e.key === ' ') setListening(action);
                        return;
                      }
                      if (e.key === 'Escape') {
                        setListening(null);
                        return;
                      }
                      const captured = captureKey(e);
                      if (captured) save(action, captured);
                    }}
                  >
                    {isListening ? t('Press a key...') : formatKey(currentKey)}
                  </KeyBadge>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </ConfigPanel>
  );
};

export default KeyboardShortcutsConfig;
