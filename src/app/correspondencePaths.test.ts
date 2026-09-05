import { normalizeCorrespondencePath } from './correspondencePaths'

describe('legacy correspondence links', () => {
  it.each([
    ['/courriers/externals/123/signature?from=notification#document', '/courriers/externes/123/signature?from=notification#document'],
    ['/courriers/internals/456', '/courriers/internes/456'],
    ['/courriers/externals', '/courriers/externes'],
    ['/courriers/internals?view=drafts', '/courriers/internes?view=drafts'],
    ['/courriers/externes/123', '/courriers/externes/123'],
    ['/activite?next=/courriers/externals/123', '/activite?next=/courriers/externals/123'],
    ['/courriers/externals-other/123', '/courriers/externals-other/123'],
    ['', ''],
  ])('normalizes %s without altering the rest of the destination', (path, expected) => {
    expect(normalizeCorrespondencePath(path)).toBe(expected)
  })
})
