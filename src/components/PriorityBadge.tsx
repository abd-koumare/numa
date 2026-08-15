import { Box, Typography } from '@mui/material'
import type { Priority } from '../types/ui'

const priorityColors: Record<Priority, string> = {
  Basse: '#16A34A',
  Normale: '#2563EB',
  Haute: '#D97706',
  Urgente: '#DC2626',
}

type PriorityBadgeProps = {
  priority: Priority
}

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
      <Box aria-hidden="true" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: priorityColors[priority], flexShrink: 0 }} />
      <Typography variant="caption" color="text.secondary" fontWeight={600}>
        {priority}
      </Typography>
    </Box>
  )
}
