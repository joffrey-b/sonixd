import React, { useEffect, useMemo, useRef } from 'react';
import styled from 'styled-components';
import { InfoModal } from '../modal/Modal';
import { LyricsData } from '../../hooks/useGetLyrics';

const LyricsContainer = styled.div`
  max-height: 60vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 8px;
`;

const Line = styled.p<{ $active: boolean; $past: boolean }>`
  text-align: center;
  margin: 6px 0;
  padding: 0 16px;
  font-size: ${(p) => (p.$active ? '1.1em' : '1em')};
  font-weight: ${(p) => (p.$active ? '600' : 'normal')};
  opacity: ${(p) => {
    if (p.$active) return 1;
    if (p.$past) return 0.35;
    return 0.6;
  }};
  transition: opacity 0.3s ease, font-size 0.2s ease;
  line-height: 1.7;
  cursor: default;
`;

interface Props {
  show: boolean;
  handleHide: () => void;
  lyrics: LyricsData | null | undefined;
  currentTime: number; // seconds
}

const LyricsModal = ({ show, handleHide, lyrics, currentTime }: Props) => {
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
    <InfoModal width="480px" show={show} handleHide={handleHide}>
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
          >
            {line.text}
          </Line>
        ))}
      </LyricsContainer>
    </InfoModal>
  );
};

export default LyricsModal;
