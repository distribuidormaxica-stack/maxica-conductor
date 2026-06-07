// Tokens de diseño compartidos por toda la app del conductor.
// Mantiene una identidad visual moderna y consistente (colores, radios, sombras).

export const colors = {
  primary:      '#0284C7',
  primaryDark:  '#0369A1',
  primarySoft:  '#E0F2FE',

  bg:           '#F1F5F9',
  surface:      '#FFFFFF',

  text:         '#0F172A',
  textSoft:     '#64748B',
  textMuted:    '#94A3B8',
  border:       '#E2E8F0',

  success:      '#16A34A',
  successBg:    '#DCFCE7',
  danger:       '#DC2626',
  dangerBg:     '#FEE2E2',
  warning:      '#D97706',
  warningBg:    '#FEF3C7',
  info:         '#0284C7',
  infoBg:       '#DBEAFE',
  orange:       '#F97316',
  orangeBg:     '#FFEDD5',
  slate:        '#475569',

  // Marca Maxica
  brandRed:     '#D7261E',
}

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, full: 999 }

// Sombra suave y consistente (iOS + Android)
export function shadow(elevation = 4) {
  return {
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: elevation * 2,
    shadowOffset: { width: 0, height: Math.max(1, Math.round(elevation / 2)) },
    elevation,
  }
}
