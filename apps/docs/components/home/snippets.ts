export type Lang = 'ts' | 'go' | 'py' | 'rs' | 'curl';

export interface Token {
  t: 'k' | 's' | 'p' | '';
  v: string;
}

export interface Snippet {
  id: Lang;
  label: string;
  caption: string;
  /** Lines as token runs; '' kind = plain identifier colour. */
  lines: Token[][];
}

const k = (v: string): Token => ({ t: 'k', v });
const s = (v: string): Token => ({ t: 's', v });
const p = (v: string): Token => ({ t: 'p', v });
const _ = (v: string): Token => ({ t: '', v });

export const SNIPPETS: Snippet[] = [
  {
    id: 'ts',
    label: 'TypeScript',
    caption: 'Verify a user on your backend — Hono',
    lines: [
      [k('import'), _(' { createVerifier } '), k('from'), s(' "@au1h/server"'), _(';')],
      [k('import'), _(' { requireAu1hUser } '), k('from'), s(' "@au1h/server/hono"'), _(';')],
      [],
      [k('const'), _(' au1h = createVerifier({ au1hUrl: AU1H_URL, appSlug: '), s('"todo"'), _(' });')],
      [],
      [_('app.use('), s('"/api/*"'), _(', requireAu1hUser(au1h));')],
      [_('app.get('), s('"/api/me"'), _(', (c) '), k('=>'), _(' c.json(c.get('), s('"au1hUser"'), _(')));')],
    ],
  },
  {
    id: 'go',
    label: 'Go',
    caption: 'Verify a user on your backend — net/http',
    lines: [
      [_('v, _ := au1h.NewVerifier(ctx, au1h.Options{URL: au1hURL, AppSlug: '), s('"todo"'), _('})')],
      [],
      [_('mux.Handle('), s('"GET /api/me"'), _(', v.RequireUser(http.HandlerFunc('), k('func'), _('(w http.ResponseWriter, r *http.Request) {')],
      [_('    user, _ := au1h.UserFromContext(r.Context())')],
      [_('    json.NewEncoder(w).Encode(user)')],
      [_('})))')],
    ],
  },
  {
    id: 'py',
    label: 'Python',
    caption: 'Verify a user on your backend — FastAPI',
    lines: [
      [_('au1h = Verifier('), s('"https://auth.example.com"'), _(', '), s('"todo"'), _(')')],
      [_('current_user = require_user(au1h)')],
      [],
      [k('@app.get'), _('('), s('"/api/me"'), _(')')],
      [k('def'), _(' me(user: User = Depends(current_user)):')],
      [_('    '), k('return'), _(' user')],
    ],
  },
  {
    id: 'rs',
    label: 'Rust',
    caption: 'Verify a user on your backend — jsonwebtoken',
    lines: [
      [k('let mut'), _(' validation = Validation::new(Algorithm::EdDSA);')],
      [_('validation.set_issuer(&[AU1H_URL]);')],
      [_('validation.set_audience(&['), s('"todo"'), _(']);')],
      [k('let'), _(' claims = decode::<Claims>(token, &key, &validation)?.claims;')],
    ],
  },
  {
    id: 'curl',
    label: 'curl',
    caption: 'Sign in and mint a token',
    lines: [
      [k('curl'), p(' -c'), _(' jar'), p(' -H'), s(" 'x-app-id: todo'"), p(' -H'), s(" 'content-type: application/json'"), p(' \\')],
      [p('  -d'), s(' \'{"email":"john@example.com","password":"…"}\''), p(' \\')],
      [_('  https://auth.example.com/api/auth/sign-in/email')],
      [k('curl'), p(' -b'), _(' jar'), p(' -H'), s(" 'x-app-id: todo'"), _(' https://auth.example.com/api/auth/token')],
    ],
  },
];

export function snippetText(snippet: Snippet): string {
  return snippet.lines.map((line) => line.map((t) => t.v).join('')).join('\n');
}
