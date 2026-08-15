import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { App } from './App'
import { numaTheme } from './theme'

function renderApp(path = '/') {
  window.history.pushState({}, '', path)
  return render(
    <ThemeProvider theme={numaTheme}>
      <CssBaseline />
      <App />
    </ThemeProvider>,
  )
}

describe('NUMA application shell', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders the dashboard and its landmark structure', () => {
    renderApp()

    expect(screen.getByRole('heading', { name: 'Bonjour, Kader', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Navigation principale' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Recherche globale' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveAttribute('id', 'contenu-principal')
    expect(screen.getByRole('link', { name: 'Aller au contenu' })).toBeInTheDocument()
    expect(screen.getAllByText('Courriers internes').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Courriers externes').length).toBeGreaterThan(0)
    expect(screen.getByText('© 2026 NUMA — Tous droits réservés à Koogin SAS')).toBeInTheDocument()
    expect(screen.getByText('Prototype UI v0.3.0')).toBeInTheDocument()
  })

  it('shows the global legal footer on public identity screens', () => {
    renderApp('/connexion')

    expect(screen.getByTestId('app-footer')).toBeInTheDocument()
    expect(screen.getByText('© 2026 NUMA — Tous droits réservés à Koogin SAS')).toBeInTheDocument()
    expect(screen.getByText('Prototype UI v0.3.0')).toBeInTheDocument()
  })

  it('reveals chart values on hover and updates them with the selected period', async () => {
    const user = userEvent.setup()
    renderApp()

    const monday = screen.getByRole('img', { name: 'Lun : 4 courriers internes, 5 courriers externes, total 9' })
    await user.hover(monday)
    expect(await screen.findByText('Total : 9')).toBeInTheDocument()
    await user.unhover(monday)

    await user.click(screen.getByRole('button', { name: '4 semaines' }))
    const firstWeek = screen.getByRole('img', { name: 'Sem. 1 : 28 courriers internes, 34 courriers externes, total 62' })
    await user.hover(firstWeek)
    expect(await screen.findByText('Total : 62')).toBeInTheDocument()
  })

  it('opens the external correspondence registry from the navigation', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: 'Courriers' }))
    await user.click(screen.getByRole('menuitem', { name: 'Courriers externes' }))

    expect(screen.getByRole('heading', { name: 'Courriers externes 2026', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Courriers externes 2026' })).toBeInTheDocument()
    expect(screen.getByText('Externe 2026 · Active')).toBeInTheDocument()
  })

  it('filters the registry and stores the search in the URL', async () => {
    renderApp('/courriers/externes')

    fireEvent.change(screen.getByRole('searchbox', { name: 'Rechercher dans le registre' }), {
      target: { value: 'Ambassade' },
    })

    await waitFor(() => expect(window.location.search).toContain('q=Ambassade'))
    expect(screen.getAllByText('Invitation à la réunion COP30').length).toBeGreaterThan(0)
    expect(screen.getByText('Affichage 1–1 sur 1 résultat')).toBeInTheDocument()
    expect(screen.queryByText('Demande de subvention 2026')).not.toBeInTheDocument()
  })

  it('gives the internal registry the same complete registry experience', async () => {
    renderApp('/courriers/internes')

    expect(screen.getByRole('heading', { name: 'Courriers internes 2026', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Courriers internes 2026' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'À traiter' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Importer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exporter' })).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Rechercher dans le registre interne' }), {
      target: { value: 'Congés' },
    })

    await waitFor(() => expect(window.location.search).toContain('q=Cong%C3%A9s'))
    expect(screen.getAllByText('Note de service — Congés août').length).toBeGreaterThan(0)
    expect(screen.getByText('Affichage 1–1 sur 1 résultat')).toBeInTheDocument()
  })

  it('exports the currently filtered registry as CSV', async () => {
    const user = userEvent.setup()
    const createObjectURL = vi.fn(() => 'blob:numa-export')
    const revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    renderApp('/courriers/externes?q=Ambassade')

    await user.click(screen.getByRole('button', { name: 'Exporter' }))

    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:numa-export')
    expect(screen.getByText('Export de 1 courrier généré')).toBeInTheDocument()
    click.mockRestore()
  })

  it('exposes text labels for business statuses', () => {
    renderApp()

    expect(screen.getAllByText('En validation').length).toBeGreaterThan(0)
    expect(screen.getAllByText('À traiter').length).toBeGreaterThan(0)
  })

  it('renders the complete correspondence creation form', () => {
    renderApp('/courriers/nouveau?type=externe')

    expect(screen.getByRole('heading', { name: 'Nouveau courrier', level: 1 })).toBeInTheDocument()
    expect(screen.getByLabelText(/Expéditeur/)).toHaveValue('Société KORHOGO BTP')
    expect(screen.getByRole('heading', { name: 'Documents' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Workflow proposé' })).toBeInTheDocument()
  })

  it('shows document versions and signature proofs on a correspondence', async () => {
    const user = userEvent.setup()
    renderApp('/courriers/externes/ext-0040-2026')

    await user.click(screen.getByRole('tab', { name: /Documents/ }))
    expect(screen.getByRole('heading', { name: 'Versions du document' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Preuves de signature' })).toBeInTheDocument()
    expect(screen.getByText(/Une signature couvre uniquement la version précise/)).toBeInTheDocument()
  })

  it('offers the three required signature levels bound to document version 3', () => {
    renderApp('/courriers/externes/ext-0040-2026/signature')

    expect(screen.getByRole('heading', { name: 'Signature électronique', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Validation électronique/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Signature graphique/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: /Signature numérique/ })).toBeInTheDocument()
    expect(screen.getByText('version 3', { selector: 'strong' })).toBeInTheDocument()
  })

  it('uploads PNG and SVG logos, publishes one, and restores NUMA', async () => {
    const user = userEvent.setup()
    renderApp('/administration/site')
    const logo = new File([
      '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="48"><rect width="160" height="48" fill="#123E7C"/></svg>',
    ], 'orgatech.svg', { type: 'image/svg+xml' })

    await user.upload(screen.getByLabelText('Choisir un logo PNG ou SVG'), logo)
    expect(await screen.findByText('orgatech.svg')).toBeInTheDocument()
    expect(screen.getByTestId('branding-preview-logo')).toHaveAttribute('src', expect.stringContaining('data:image/svg+xml'))

    const pngLogo = new File([new Uint8Array([137, 80, 78, 71])], 'orgatech.png', { type: 'image/png' })
    await user.upload(screen.getByLabelText('Choisir un logo PNG ou SVG'), pngLogo)
    expect(await screen.findByText('orgatech.png')).toBeInTheDocument()
    expect(screen.getByTestId('branding-preview-logo')).toHaveAttribute('src', expect.stringContaining('data:image/png'))

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(screen.getAllByAltText('Logo ORGATECH').length).toBeGreaterThan(0)
    expect(screen.getByText('Identité visuelle enregistrée')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Restaurer NUMA' }))
    expect(screen.getAllByAltText('NUMA').length).toBeGreaterThan(0)
  })

  it('rejects unsupported and oversized organization logos', () => {
    renderApp('/administration/site')
    const input = screen.getByLabelText('Choisir un logo PNG ou SVG')

    fireEvent.change(input, { target: { files: [new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })] } })
    expect(screen.getByText(/Format non pris en charge/)).toBeInTheDocument()

    const oversized = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [oversized] } })
    expect(screen.getByText(/dépasse la taille maximale/)).toBeInTheDocument()
  })

  it('configures and previews numbering by responsible service', async () => {
    const user = userEvent.setup()
    renderApp('/administration/listes')

    await user.click(screen.getByRole('button', { name: 'Numérotation' }))
    expect(screen.getByLabelText(/Format du numéro/)).toHaveValue('{SERVICE}/{SEQUENCE:0000}/{ANNEE}')
    expect(screen.getByTestId('numbering-preview')).toHaveTextContent('DSI/0053/2026')

    await user.click(screen.getByRole('combobox', { name: 'Service responsable' }))
    await user.click(screen.getByRole('option', { name: /RH — Ressources humaines/ }))
    expect(screen.getByTestId('numbering-preview')).toHaveTextContent('RH/0053/2026')

    fireEvent.change(screen.getByLabelText(/Format du numéro/), { target: { value: '{SERVICE}/{ANNEE}' } })
    expect(screen.getByText(/doit contenir la variable \{SEQUENCE\}/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enregistrer la numérotation' })).toBeDisabled()
  })

  it('shows the configured service-based reference in correspondence creation', async () => {
    const user = userEvent.setup()
    renderApp('/courriers/nouveau?type=externe')

    expect(screen.getByTestId('creation-numbering-preview')).toHaveTextContent('DSI/0053/2026')
    await user.click(screen.getByRole('combobox', { name: 'Service responsable' }))
    await user.click(screen.getByRole('option', { name: /FIN — Direction financière/ }))
    expect(screen.getByTestId('creation-numbering-preview')).toHaveTextContent('FIN/0053/2026')
  })
})
