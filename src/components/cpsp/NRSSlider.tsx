import React from 'react';

// Theme colours duplicated here to keep the component self-contained.
// When App.tsx is split further, import from a shared theme module instead.
const T_SUCCESS = '#276749';
const T_WARNING = '#DD6B20';
const T_DANGER  = '#E53E3E';

const getLbl = (): React.CSSProperties => ({
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#6B8080',
  marginBottom: 4,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
});

export function getNrsColor(v: number): string {
  return v <= 3 ? T_SUCCESS : v <= 6 ? T_WARNING : T_DANGER;
}

interface NRSSliderProps {
  label: string;
  value: number;
  onChange: (n: number) => void;
}

export function NRSSlider({ label, value, onChange }: NRSSliderProps) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={getLbl()}>{label}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
          <button
            key={n}
            onClick={() => onChange(n)}
            style={{
              width: 38, height: 38, borderRadius: 10,
              border: `2px solid ${getNrsColor(n)}`,
              backgroundColor: value === n ? getNrsColor(n) : 'transparent',
              color: value === n ? '#fff' : getNrsColor(n),
              fontWeight: 800, fontSize: 13, cursor: 'pointer',
            }}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
