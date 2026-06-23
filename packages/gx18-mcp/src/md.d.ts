// Allow TypeScript to import .md files as strings.
// esbuild resolves these at build time via loader: { '.md': 'text' } —
// no file system access at runtime; the content is inlined in the bundle.
declare module '*.md' {
  const content: string;
  export default content;
}
