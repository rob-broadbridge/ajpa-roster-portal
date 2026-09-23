// Local UI smoke-test harness. Never contacts Supabase or sends email.
// Run: node tests/manual-stage2a-server.js, then open http://127.0.0.1:5174.
// Any email/password signs into the synthetic account. Change its status/role
// with /__test?status=Approved&role=Admin; /__test returns the request log.
import { createServer } from 'vite';

const origin = 'http://127.0.0.1:5174';
const profile = { id: '00000000-0000-0000-0000-000000000001', full_name: 'Local Applicant',
  email: 'applicant@example.invalid', phone: '123', warrant_number: 'JP-9001',
  status: 'Pending', role: 'Member', is_provisional: false };
const requests = [];
const user = () => ({ id: profile.id, email: profile.email, aud: 'authenticated', role: 'authenticated',
  identities: [{ id: profile.id }], app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
const token = () => {
  const expiry = Math.floor(Date.now()/1000)+3600;
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return { access_token: `${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:profile.id,exp:expiry})}.local-only`,
    refresh_token: 'local-only', expires_in: 3600, expires_at: expiry, token_type: 'bearer', user: user() };
};
const server = await createServer({
  define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(origin),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('local-test-key') },
  server: { host: '127.0.0.1', port: 5174, strictPort: true,
    headers: { 'Content-Security-Policy': "connect-src 'self' ws://127.0.0.1:5174; form-action 'self'" } },
  plugins: [{ name: 'stage2a-local-only', configureServer(vite) {
    vite.middlewares.use(async (req,res,next) => {
      const url = new URL(req.url,origin);
      const send = (body,status=200) => { res.statusCode=status; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(body)); };
      if (url.pathname === '/__test') {
        if (url.searchParams.has('status')) profile.status=url.searchParams.get('status');
        if (url.searchParams.has('role')) profile.role=url.searchParams.get('role');
        return send({profile,requests});
      }
      if (!url.pathname.startsWith('/auth/v1/') && !url.pathname.startsWith('/rest/v1/')) return next();
      let raw=''; for await (const chunk of req) raw+=chunk;
      const body=raw ? JSON.parse(raw) : {};
      requests.push({method:req.method,path:url.pathname});
      if (url.pathname==='/auth/v1/token') return send(token());
      if (url.pathname==='/auth/v1/signup') return send(user());
      if (url.pathname==='/auth/v1/logout') return send({});
      if (url.pathname==='/auth/v1/user') return send(user());
      if (url.pathname==='/rest/v1/profiles') return send(profile);
      if (url.pathname==='/rest/v1/rpc/update_pending_profile') {
        if (profile.status!=='Pending') return send({code:'42501',message:'Only Pending applicants may use this operation.'},403);
        Object.assign(profile,{full_name:body.p_full_name,phone:body.p_phone,warrant_number:body.p_warrant_number,is_provisional:body.p_is_provisional});
        return send(null);
      }
      if (profile.status!=='Approved') return send({code:'42501',message:'Approved membership required.'},403);
      if (url.pathname==='/rest/v1/rpc/get_roster_member_directory_for_current_user') return send([profile]);
      return send([]);
    });
  } }]
});
await server.listen();
console.log(`Local Stage 2A UI fixture: ${origin}`);
