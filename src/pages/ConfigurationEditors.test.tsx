import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ListBuilderPage, PageBuilderPage, WorkflowBuilderPage } from './AdministrationPages'
import { FieldFormBuilderPage } from './AdvancedBuilderPages'
import { createConfigurationDraft, publishConfiguration, resolveConfiguration, useConfigurations, type ConfigurationDefinition } from '../api/configurations'

vi.mock('../api/client', () => ({ API_DATA_ENABLED: true }))
vi.mock('../api/configurations')
vi.mock('../app/PrototypeDataContext', () => ({ usePrototypeData: () => ({ lists: [] }) }))

const version = { id: 'v1', version: 1, state: 'published' as const, data: {}, validation_errors: [], created_at: '', published_at: '' }
const definition: ConfigurationDefinition = {
  id: 'definition', slug: 'definition', kind: 'list', name: 'Configuration de test', description: '', active: true,
  current_version: version, latest_version: version, created_at: '', updated_at: '',
}

describe('configuration publication recovery', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(useConfigurations).mockReturnValue({ data: [], loading: false, error: '', reload: vi.fn() })
    vi.mocked(resolveConfiguration).mockImplementation(async (kind) => ({
      ...definition, kind,
      latest_version: { ...version, data: kind === 'list' ? { bindings: { form: 'form' } } : kind === 'form' ? {
        fields: [{ key: 'subject', label: 'Objet', type: 'text', required: true }],
      } : {} },
    }))
    vi.mocked(createConfigurationDraft).mockImplementation(async (current, input) => ({
      ...current, latest_version: { ...version, version: current.latest_version!.version + 1, state: 'draft', data: input.data },
    }))
    vi.mocked(publishConfiguration).mockRejectedValueOnce(new Error('Publication indisponible'))
      .mockImplementation(async (current) => ({ ...current, latest_version: { ...current.latest_version!, state: 'published' } }))
  })

  it.each([
    ['list', ListBuilderPage], ['page', PageBuilderPage], ['workflow', WorkflowBuilderPage], ['form', FieldFormBuilderPage],
  ] as const)('keeps the saved draft version after a failed %s publication', async (_, Editor) => {
    render(<MemoryRouter initialEntries={['/edit/definition']}><Routes><Route path="/edit/:id" element={<Editor />} /></Routes></MemoryRouter>)
    const save = screen.getByRole('button', { name: 'Enregistrer et publier' })
    await waitFor(() => expect(save).toBeEnabled())
    fireEvent.click(save)
    await screen.findByText('Publication indisponible')
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et publier' }))
    await waitFor(() => expect(publishConfiguration).toHaveBeenCalledTimes(2))
    expect(vi.mocked(createConfigurationDraft).mock.calls.map(([current]) => current.latest_version?.version)).toEqual([1, 2])
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer et publier' })).toBeEnabled())
  })
})
