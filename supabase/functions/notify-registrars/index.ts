import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (request.headers.get('x-webhook-secret') !== Deno.env.get('REGISTRAR_WEBHOOK_SECRET')) return new Response('Unauthorized', { status: 401 });

  const { record: profile } = await request.json();
  if (!profile || profile.status !== 'Pending') return Response.json({ ignored: true });

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const { data: registrars, error } = await supabase.from('profiles').select('email').eq('role', 'Registrar').eq('status', 'Approved');
  if (error) throw error;
  const recipients = (registrars ?? []).map((registrar) => registrar.email).filter(Boolean);
  if (!recipients.length) return Response.json({ sent: 0 });

  const text = `A new JP sign-up is awaiting review in the AJPA Roster Portal.\n\nName: ${profile.full_name || 'Not supplied'}\nEmail: ${profile.email || 'Not supplied'}\nWarrant number: ${profile.warrant_number || 'Not supplied'}\nPhone: ${profile.phone || 'Not supplied'}\n\nSign in as a Registrar and open Registrar Governance Portal > JP Members to review it.`;
  await Promise.all(recipients.map(async (recipient) => {
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('RESEND_FROM_EMAIL'),
        to: [recipient],
        subject: `AJPA Roster Portal: new JP sign-up — ${profile.full_name || profile.email}`,
        text,
      }),
    });
    if (!emailResponse.ok) throw new Error(`Resend rejected the email: ${await emailResponse.text()}`);
  }));
  return Response.json({ sent: recipients.length });
});
