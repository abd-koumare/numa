import ArrowBack from '@mui/icons-material/ArrowBack'
import ConstructionOutlined from '@mui/icons-material/ConstructionOutlined'
import { Box, Button, Card, CardContent, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'

type ModulePlaceholderPageProps = {
  title: string
  description: string
}

export function ModulePlaceholderPage({ title, description }: ModulePlaceholderPageProps) {
  return (
    <Box sx={{ maxWidth: 960, mx: 'auto', px: { xs: 2, sm: 3, lg: 5 }, py: { xs: 3, md: 5 } }}>
      <Typography component="h1" variant="h1" sx={{ mb: 1 }}>
        {title}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 4 }}>
        {description}
      </Typography>
      <Card>
        <CardContent sx={{ p: { xs: 3, md: 5 }, textAlign: 'center' }}>
          <ConstructionOutlined sx={{ fontSize: 44, color: 'accent.dark', mb: 2 }} />
          <Typography component="h2" variant="h3" sx={{ mb: 1 }}>
            Parcours préparé
          </Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 560, mx: 'auto', mb: 3 }}>
            Cette route fait partie de la cartographie NUMA. Sa conception détaillée sera réalisée dans le prochain lot.
          </Typography>
          <Button component={RouterLink} to="/" variant="outlined" startIcon={<ArrowBack />}>
            Retour au tableau de bord
          </Button>
        </CardContent>
      </Card>
    </Box>
  )
}
