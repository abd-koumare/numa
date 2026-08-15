import { Chip } from '@mui/material'
import type { BusinessStatus } from '../types/ui'

const statusStyles: Record<BusinessStatus, { color: string; background: string }> = {
  'À traiter': { color: '#1D4ED8', background: '#EFF6FF' },
  'En validation': { color: '#B45309', background: '#FFF7ED' },
  Validé: { color: '#15803D', background: '#F0FDF4' },
  Brouillon: { color: '#475569', background: '#F1F5F9' },
  Rejeté: { color: '#B91C1C', background: '#FEF2F2' },
  Annulé: { color: '#7F1D1D', background: '#FFF1F2' },
  Signé: { color: '#087E8B', background: '#ECFEFF' },
}

type StatusChipProps = {
  status: BusinessStatus
}

export function StatusChip({ status }: StatusChipProps) {
  const style = statusStyles[status]

  return (
    <Chip
      label={status}
      size="small"
      sx={{
        height: 24,
        color: style.color,
        bgcolor: style.background,
        border: `1px solid ${style.color}33`,
        '& .MuiChip-label': { px: 1, fontSize: '0.7rem' },
      }}
    />
  )
}
