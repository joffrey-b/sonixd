import React, { useEffect, useRef } from 'react';
import styled, { useTheme } from 'styled-components';
import { FlexboxGrid } from 'rsuite';
import { useTranslation } from 'react-i18next';
import { ConfigOptionSection, ConfigPanel } from '../styled';
import {
  StyledButton,
  StyledInputNumber,
  StyledInputPicker,
  StyledInputPickerContainer,
  StyledToggle,
} from '../../shared/styled';
import { useAppDispatch, useAppSelector } from '../../../redux/hooks';
import {
  setPeqEnabled,
  setPeqBandField,
  resetPeqBands,
  PeqBand,
  PeqState,
} from '../../../redux/peqSlice';
import { settings } from '../../shared/setDefaultSettings';

const SAMPLE_RATE = 48000;
const SVG_W = 600;
const SVG_H = 160;
const DB_MAX = 24;
const DB_MIN = -24;
const FREQ_MIN = 20;
const FREQ_MAX = 20000;
const N_POINTS = 300;

const logFreqs = Array.from({ length: N_POINTS }, (_, i) => {
  const t = i / (N_POINTS - 1);
  return FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, t);
});

function xPos(f: number) {
  return (
    ((Math.log10(f) - Math.log10(FREQ_MIN)) / (Math.log10(FREQ_MAX) - Math.log10(FREQ_MIN))) * SVG_W
  );
}

function yPos(db: number) {
  return ((DB_MAX - db) / (DB_MAX - DB_MIN)) * SVG_H;
}

function bandMagnitudeDb(band: PeqBand, f: number): number {
  if (!band.enabled) return 0;
  const A = Math.pow(10, band.gain / 40);
  const w0 = (2 * Math.PI * band.freq) / SAMPLE_RATE;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2 * band.q);
  const sqrtA = Math.sqrt(A);

  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;

  switch (band.type) {
    case 'peaking':
      b0 = 1 + alpha * A;
      b1 = -2 * cosW0;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cosW0;
      a2 = 1 - alpha / A;
      break;
    case 'lowshelf':
      b0 = A * (A + 1 - (A - 1) * cosW0 + 2 * sqrtA * alpha);
      b1 = 2 * A * (A - 1 - (A + 1) * cosW0);
      b2 = A * (A + 1 - (A - 1) * cosW0 - 2 * sqrtA * alpha);
      a0 = A + 1 + (A - 1) * cosW0 + 2 * sqrtA * alpha;
      a1 = -2 * (A - 1 + (A + 1) * cosW0);
      a2 = A + 1 + (A - 1) * cosW0 - 2 * sqrtA * alpha;
      break;
    case 'highshelf':
      b0 = A * (A + 1 + (A - 1) * cosW0 + 2 * sqrtA * alpha);
      b1 = -2 * A * (A - 1 + (A + 1) * cosW0);
      b2 = A * (A + 1 + (A - 1) * cosW0 - 2 * sqrtA * alpha);
      a0 = A + 1 - (A - 1) * cosW0 + 2 * sqrtA * alpha;
      a1 = 2 * (A - 1 - (A + 1) * cosW0);
      a2 = A + 1 - (A - 1) * cosW0 - 2 * sqrtA * alpha;
      break;
    case 'lowpass':
      b0 = (1 - cosW0) / 2;
      b1 = 1 - cosW0;
      b2 = (1 - cosW0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
    case 'highpass':
      b0 = (1 + cosW0) / 2;
      b1 = -(1 + cosW0);
      b2 = (1 + cosW0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
    case 'notch':
      b0 = 1;
      b1 = -2 * cosW0;
      b2 = 1;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
    default:
      return 0;
  }

  const wf = (2 * Math.PI * f) / SAMPLE_RATE;
  const cW = Math.cos(wf);
  const sW = Math.sin(wf);
  const c2W = Math.cos(2 * wf);
  const s2W = Math.sin(2 * wf);
  const nb0 = b0 / a0;
  const nb1 = b1 / a0;
  const nb2 = b2 / a0;
  const na1 = a1 / a0;
  const na2 = a2 / a0;
  const nR = nb0 + nb1 * cW + nb2 * c2W;
  const nI = -(nb1 * sW + nb2 * s2W);
  const dR = 1 + na1 * cW + na2 * c2W;
  const dI = -(na1 * sW + na2 * s2W);
  const mag2 = (nR * nR + nI * nI) / (dR * dR + dI * dI);
  if (mag2 <= 0) return DB_MIN;
  return 20 * Math.log10(Math.sqrt(mag2));
}

function buildCurvePath(bands: PeqBand[], enabled: boolean): string {
  return logFreqs
    .map((f, i) => {
      const db = enabled ? bands.reduce((sum, band) => sum + bandMagnitudeDb(band, f), 0) : 0;
      const clampedDb = Math.max(DB_MIN, Math.min(DB_MAX, db));
      const x = xPos(f);
      const y = yPos(clampedDb);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

const GRID_FREQS = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
const GRID_DB = [-18, -12, -6, 0, 6, 12, 18];
const LABEL_FREQS = [100, 1000, 10000];

const SvgWrapper = styled.div`
  width: 100%;
  margin-bottom: 12px;
  border-radius: 6px;
  overflow: hidden;
  background: ${(props) => props.theme.colors.input.background};
`;

const BandTable = styled.div`
  display: table;
  width: 100%;
  border-collapse: collapse;
`;

const BandRow = styled.div`
  display: table-row;
`;

const BandCell = styled.div<{ $header?: boolean; $center?: boolean }>`
  display: table-cell;
  padding: 4px 6px;
  font-size: 12px;
  vertical-align: middle;
  text-align: ${(props) => (props.$center ? 'center' : 'left')};
  color: ${(props) =>
    props.$header
      ? props.theme.colors.layout.page.colorSecondary
      : props.theme.colors.layout.page.color};
  border-bottom: 1px solid rgba(128, 128, 128, 0.15);
`;

const TYPE_DATA = [
  { label: 'Peak', value: 'peaking' },
  { label: 'Low Shelf', value: 'lowshelf' },
  { label: 'High Shelf', value: 'highshelf' },
  { label: 'Low Pass', value: 'lowpass' },
  { label: 'High Pass', value: 'highpass' },
  { label: 'Notch', value: 'notch' },
];

const NO_GAIN_TYPES = new Set(['lowpass', 'highpass', 'notch']);

const PEQConfig = ({ bordered }: any) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const peq = useAppSelector((state: any) => state.peq as PeqState);
  const theme = useTheme() as any;
  const typePickerRefs = useRef<(HTMLDivElement | null)[]>(Array(6).fill(null));

  useEffect(() => {
    settings.set('peqEnabled', peq.enabled);
  }, [peq.enabled]);
  useEffect(() => {
    settings.set('peqBands', peq.bands);
  }, [peq.bands]);

  const primaryColor = theme?.colors?.primary || '#2196f3';
  const gridColor = 'rgba(128,128,128,0.2)';
  const labelColor = theme?.colors?.layout?.page?.colorSecondary || '#888';
  const zeroDashColor = 'rgba(128,128,128,0.5)';

  const curvePath = buildCurvePath(peq.bands, peq.enabled);

  const updateBandField = (index: number, field: keyof PeqBand, value: any) => {
    dispatch(setPeqBandField({ index, field, value }));
  };

  return (
    <ConfigPanel header={t('Parametric Equalizer')} bordered={bordered} $noBackground={false}>
      <ConfigOptionSection>
        <FlexboxGrid justify="space-between" align="middle">
          <FlexboxGrid.Item style={{ fontSize: 14, fontWeight: 500 }}>
            {t('Enable Parametric EQ')}
          </FlexboxGrid.Item>
          <FlexboxGrid.Item>
            <StyledToggle
              defaultChecked={peq.enabled}
              checked={peq.enabled}
              onChange={(val: boolean) => dispatch(setPeqEnabled(val))}
            />
          </FlexboxGrid.Item>
        </FlexboxGrid>
      </ConfigOptionSection>

      <ConfigOptionSection>
        <SvgWrapper>
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            preserveAspectRatio="none"
            style={{ display: 'block', width: '100%', height: '160px' }}
          >
            {/* Vertical grid lines */}
            {GRID_FREQS.map((f) => (
              <line
                key={f}
                x1={xPos(f)}
                y1={0}
                x2={xPos(f)}
                y2={SVG_H}
                stroke={gridColor}
                strokeWidth="1"
              />
            ))}
            {/* Horizontal grid lines */}
            {GRID_DB.map((db) => (
              <line
                key={db}
                x1={0}
                y1={yPos(db)}
                x2={SVG_W}
                y2={yPos(db)}
                stroke={db === 0 ? zeroDashColor : gridColor}
                strokeWidth={db === 0 ? 1.5 : 1}
                strokeDasharray={db === 0 ? '4 3' : undefined}
              />
            ))}
            {/* Frequency labels */}
            {LABEL_FREQS.map((f) => (
              <text
                key={f}
                x={xPos(f)}
                y={SVG_H - 4}
                textAnchor="middle"
                fontSize="11"
                fill={labelColor}
              >
                {f >= 1000 ? `${f / 1000}k` : `${f}`}
              </text>
            ))}
            {/* dB labels */}
            {[-12, 0, 12].map((db) => (
              <text key={db} x={4} y={yPos(db) - 3} fontSize="10" fill={labelColor}>
                {db > 0 ? `+${db}` : db}
              </text>
            ))}
            {/* Frequency response curve */}
            <path
              d={curvePath}
              fill="none"
              stroke={peq.enabled ? primaryColor : gridColor}
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </SvgWrapper>
      </ConfigOptionSection>

      <ConfigOptionSection>
        <BandTable>
          <BandRow>
            <BandCell $header $center>
              #
            </BandCell>
            <BandCell $header $center>
              {t('On')}
            </BandCell>
            <BandCell $header>{t('Type')}</BandCell>
            <BandCell $header>{t('Freq (Hz)')}</BandCell>
            <BandCell $header>{t('Gain (dB)')}</BandCell>
            <BandCell $header>{t('Q')}</BandCell>
          </BandRow>
          {peq.bands.map((band, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <BandRow key={i}>
              <BandCell $center style={{ opacity: 0.5, width: 24 }}>
                {i + 1}
              </BandCell>
              <BandCell $center style={{ width: 36 }}>
                <StyledToggle
                  size="sm"
                  checked={band.enabled}
                  disabled={!peq.enabled}
                  onChange={(val: boolean) => updateBandField(i, 'enabled', val)}
                />
              </BandCell>
              <BandCell>
                <StyledInputPickerContainer
                  ref={(el: HTMLDivElement | null) => {
                    typePickerRefs.current[i] = el;
                  }}
                >
                  <StyledInputPicker
                    container={() => typePickerRefs.current[i]}
                    size="xs"
                    searchable={false}
                    cleanable={false}
                    disabled={!peq.enabled || !band.enabled}
                    data={TYPE_DATA}
                    value={band.type}
                    onChange={(val: string) => updateBandField(i, 'type', val as PeqBand['type'])}
                    style={{ width: 100 }}
                  />
                </StyledInputPickerContainer>
              </BandCell>
              <BandCell>
                <StyledInputNumber
                  size="xs"
                  disabled={!peq.enabled || !band.enabled}
                  value={band.freq}
                  min={20}
                  max={20000}
                  step={1}
                  width={80}
                  onChange={(val: number) => {
                    const n = Number(val);
                    if (!Number.isFinite(n)) return;
                    updateBandField(i, 'freq', Math.max(20, Math.min(20000, n)));
                  }}
                />
              </BandCell>
              <BandCell>
                <StyledInputNumber
                  size="xs"
                  disabled={!peq.enabled || !band.enabled || NO_GAIN_TYPES.has(band.type)}
                  value={NO_GAIN_TYPES.has(band.type) ? 0 : band.gain}
                  min={-12}
                  max={12}
                  step={0.5}
                  width={70}
                  onChange={(val: number) => {
                    const n = Number(val);
                    if (!Number.isFinite(n)) return;
                    updateBandField(i, 'gain', Math.max(-12, Math.min(12, n)));
                  }}
                />
              </BandCell>
              <BandCell>
                <StyledInputNumber
                  size="xs"
                  disabled={!peq.enabled || !band.enabled}
                  value={band.q}
                  min={0.1}
                  max={16}
                  step={0.1}
                  width={65}
                  onChange={(val: number) => {
                    const n = Number(val);
                    if (!Number.isFinite(n) || n <= 0) return;
                    updateBandField(i, 'q', Math.max(0.1, Math.min(16, n)));
                  }}
                />
              </BandCell>
            </BandRow>
          ))}
        </BandTable>
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
          <StyledButton size="sm" onClick={() => dispatch(resetPeqBands())}>
            {t('Reset All')}
          </StyledButton>
        </div>
      </ConfigOptionSection>
    </ConfigPanel>
  );
};

export default PEQConfig;
