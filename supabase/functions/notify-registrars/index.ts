import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (request.headers.get('x-webhook-secret') !== Deno.env.get('REGISTRAR_WEBHOOK_SECRET')) return new Response('Unauthorized', { status: 401 });

  const { type, record: profile, old_record: previousProfile } = await request.json();
  if (!profile) return Response.json({ ignored: true });

  const sendEmail = async (recipient: string, subject: string, text: string) => {
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: Deno.env.get('RESEND_FROM_EMAIL'), to: [recipient], subject, text }),
    });
    if (!emailResponse.ok) throw new Error(`Resend rejected the email: ${await emailResponse.text()}`);
  };

  if (type === 'UPDATE' && previousProfile?.status === 'Pending' && profile.status === 'Approved') {
    const memberHelp = `JP Member Help\n\n1. Account sign-up and login\nYour account is now approved. Sign in with your registered email address and password. If you forget your password, use the Forgot password? link on the sign-in screen.\n\n2. Calendar and filters\nThe Calendar shows a rolling 12-week roster. Use the Region, Desk, Shift Time and Days filters to focus on the shifts relevant to you.\n\n3. Follow service desks\nOpen Service Desks, find a desk you would like to support, and select + Follow. Your calendar can then be limited to your followed desks.\n\n4. Register for and withdraw from shifts\nUse Register on an open slot to register for one shift, the next number of shifts, until a chosen date, or all future shifts. Use Withdraw if your availability changes. Grey slots marked Desk closed or Statutory holiday are not available for registration.\n\n5. My Shifts, calendar files and statistics\nUse My Shifts to review your roster. For a registered shift, Add to Cal downloads a calendar file and Log Stats lets you record the duty statistics after the shift.\n\nThe site has an online Help function with these guidelines and further step-by-step instructions.`;
    const text = `Hello ${profile.full_name || 'JP Member'},\n\nYour access to the AJPA Service Desk Management Platform has been approved. You are now invited to log in and start using the site.\n\nThe site has an online Help function. You can also read the JP Member guidelines below.\n\n${memberHelp}\n\nRegards,\nAJPA Roster Team`;
    await sendEmail(profile.email, 'AJPA Service Desk Management Platform — access approved', text);
    return Response.json({ sent: 1, notification: 'member-approved' });
  }

  if (type !== 'INSERT' || profile.status !== 'Pending') return Response.json({ ignored: true });

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const { data: registrars, error } = await supabase.from('profiles').select('email').eq('role', 'Registrar').eq('status', 'Approved');
  if (error) throw error;
  const recipients = (registrars ?? []).map((registrar) => registrar.email).filter(Boolean);
  if (!recipients.length) return Response.json({ sent: 0 });

  const text = `A new JP sign-up is awaiting review in the AJPA Roster Portal.\n\nName: ${profile.full_name || 'Not supplied'}\nEmail: ${profile.email || 'Not supplied'}\nWarrant number: ${profile.warrant_number || 'Not supplied'}\nPhone: ${profile.phone || 'Not supplied'}\n\nSign in as a Registrar and open Registrar Governance Portal > JP Members to review it.`;
  await Promise.all(recipients.map((recipient) => sendEmail(recipient, `AJPA Roster Portal: new JP sign-up — ${profile.full_name || profile.email}`, text)));
  return Response.json({ sent: recipients.length });
});
