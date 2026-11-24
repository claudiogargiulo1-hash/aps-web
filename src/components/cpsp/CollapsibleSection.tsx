import React from 'react';

const T_PRIMARY = '#0A6E6E';
const T_BG      = '#F0F4F4';

interface CollapsibleSectionProps {
  title: string;
  open: boolean;
  onToggle: () => void;
  color?: string;
  children: React.ReactNode;
}

export function CollapsibleSection({
  title,
  open,
  onToggle,
  color = T_PRIMARY,
  children,
}: CollapsibleSectionProps) {
  return (
    <div style={{ border: `1.5px solid ${color}22`, borderRadius: 12, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between',
          padding: '10px 14px',
          background: open ? `${color}11` : T_BG,
          border: 'none', cursor: 'pointer',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 13, color }}>{title}</span>
        <span style={{ fontSize: 12, color, fontWeight: 700 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {children}
        </div>
      )}
    </div>
  );
}
