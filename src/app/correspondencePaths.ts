/** Keep links stored by older servers and demo sessions usable. */
export function normalizeCorrespondencePath(path: string): string {
  return path.replace(/^\/courriers\/(externals|internals)(?=\/|\?|#|$)/, (_, registry: string) =>
    `/courriers/${registry === 'internals' ? 'internes' : 'externes'}`,
  )
}
