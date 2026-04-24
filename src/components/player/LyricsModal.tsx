import React, { useEffect, useMemo, useRef } from 'react';
import styled from 'styled-components';
import { Icon } from 'rsuite';
import format from 'format-duration';
import { InfoModal } from '../modal/Modal';
import { LyricsData } from '../../hooks/useGetLyrics';
import { StyledIconButton } from '../shared/styled';
import Slider from '../slider/Slider';

const ModalInner = styled.div`
  display: flex;
  flex-direction: column;
  height: 75vh;
`;

const LyricsContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 8px;
`;

const Line = styled.p<{ $active: boolean; $past: boolean; $clickable: boolean }>`
  text-align: center;
  margin: 6px 0;
  padding: 4px 16px;
  border-radius: 4px;
  font-size: ${(p) => (p.$active ? '1.1em' : '1em')};
  font-weight: ${(p) => (p.$active ? '600' : 'normal')};
  opacity: ${(p) => {
    if (p.$active) return 1;
    if (p.$past) return 0.35;
    return 0.6;
  }};
  transition: opacity 0.3s ease, font-size 0.2s ease;
  line-height: 1.7;
  cursor: ${(p) => (p.$clickable ? 'pointer' : 'default')};
  &:hover {
    opacity: ${(p) => (p.$clickable ? 0.9 : undefined)};
    background: ${(p) => (p.$clickable ? 'rgba(255,255,255,0.05)' : 'transparent')};
  }
`;

const Controls = styled.div`
  padding: 12px 16px 8px;
  border-top: 1px solid rgba(128, 128, 128, 0.2);
  flex-shrink: 0;
`;

const SeekRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
`;

const TimeLabel = styled.span`
  font-size: 0.75em;
  opacity: 0.55;
  min-width: 36px;
  user-select: none;
`;

const ButtonRow = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
`;

interface Props {
  show: boolean;
  handleHide: () => void;
  lyrics: LyricsData | null | undefined;
  currentTime: number;
  duration: number;
  playerStatus: string;
  handlePlayPause: () => void;
  handlePrevTrack: () => void;
  handleNextTrack: () => void;
  handleSeekSlider: (e: number) => void;
}

const LyricsModal = ({
  show,
  handleHide,
  lyrics,
  currentTime,
  duration,
  playerStatus,
  handlePlayPause,
  handlePrevTrack,
  handleNextTrack,
  handleSeekSlider,
}: Props) => {
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const currentTimeMs = currentTime * 1000;

  const activeIndex = useMemo(() => {
    if (!lyrics?.synced || !lyrics.lines.length) return -1;
    let idx = -1;
    for (let i = 0; i < lyrics.lines.length; i += 1) {
      if (lyrics.lines[i].time !== null && lyrics.lines[i].time! <= currentTimeMs) {
        idx = i;
      }
    }
    return idx;
  }, [lyrics, currentTimeMs]);

  useEffect(() => {
    if (show && activeIndex >= 0 && lineRefs.current[activeIndex]) {
      lineRefs.current[activeIndex]!.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [show, activeIndex]);

  if (!lyrics?.lines?.length) return null;

  return (
    <InfoModal width="560px" show={show} handleHide={handleHide}>
      <ModalInner>
        <LyricsContainer>
          {lyrics.lines.map((line, i) => (
            <Line
              // eslint-disable-next-line react/no-array-index-key
              key={i}
              ref={(el) => {
                lineRefs.current[i] = el;
              }}
              $active={i === activeIndex}
              $past={lyrics.synced && activeIndex >= 0 && i < activeIndex}
              $clickable={lyrics.synced && line.time !== null}
              onClick={() => {
                if (lyrics.synced && line.time !== null) {
                  handleSeekSlider(line.time / 1000);
                }
              }}
            >
              {line.text}
            </Line>
          ))}
        </LyricsContainer>
        <Controls>
          <SeekRow>
            <TimeLabel>{format(currentTime * 1000)}</TimeLabel>
            <div style={{ flex: 1 }}>
              <Slider
                value={currentTime}
                min={0}
                max={duration || 0}
                onAfterChange={handleSeekSlider}
                toolTipType="time"
              />
            </div>
            <TimeLabel style={{ textAlign: 'right' }}>{format(duration * 1000)}</TimeLabel>
          </SeekRow>
          <ButtonRow>
            <StyledIconButton
              appearance="subtle"
              icon={<Icon icon="step-backward" />}
              onClick={handlePrevTrack}
            />
            <StyledIconButton
              appearance="subtle"
              size="lg"
              icon={<Icon icon={playerStatus === 'PLAYING' ? 'pause-circle' : 'play-circle'} />}
              onClick={handlePlayPause}
            />
            <StyledIconButton
              appearance="subtle"
              icon={<Icon icon="step-forward" />}
              onClick={handleNextTrack}
            />
          </ButtonRow>
        </Controls>
      </ModalInner>
    </InfoModal>
  );
};

export default LyricsModal;
