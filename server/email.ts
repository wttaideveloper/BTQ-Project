import sgMail from '@sendgrid/mail';

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

interface TeamInvitationEmailParams {
  inviteeEmail: string;
  inviterName: string;
  teamName: string;
  gameSessionId: string;
  invitationId: string;
}

export async function sendTeamInvitationEmail(params: TeamInvitationEmailParams): Promise<boolean> {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn('SendGrid API key not configured, skipping email');
    return false;
  }

  try {
    const msg = {
      to: params.inviteeEmail,
      from: 'noreply@faithiq.game', // You'll need to verify this sender
      subject: `Join ${params.inviterName}'s Team in FaithIQ!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2563eb; font-size: 28px; margin-bottom: 10px;">FaithIQ</h1>
            <p style="color: #6b7280; font-size: 16px;">Bible Trivia Challenge</p>
          </div>
          
          <div style="background: #f8fafc; padding: 30px; border-radius: 12px; margin-bottom: 30px;">
            <h2 style="color: #1f2937; margin-bottom: 20px;">You're Invited to Join a Team!</h2>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
              <strong>${params.inviterName}</strong> has invited you to join their team <strong>"${params.teamName}"</strong> 
              for an exciting Bible trivia challenge in FaithIQ!
            </p>
            <p style="color: #4b5563; font-size: 14px; line-height: 1.6;">
              Team up with 2 other players and compete in real-time Bible trivia. Test your knowledge 
              and have fun learning together!
            </p>
          </div>
          
          <div style="text-align: center; margin-bottom: 30px;">
            <a href="${process.env.CLIENT_URL || 'http://localhost:5000'}/game?invitation=${params.invitationId}" 
               style="background: #2563eb; color: white; padding: 15px 30px; text-decoration: none; 
                      border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px;">
              Join Team Now
            </a>
          </div>
          
          <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; text-align: center;">
            <p style="color: #9ca3af; font-size: 12px; margin-bottom: 10px;">
              This invitation will expire in 5 minutes. Join quickly!
            </p>
            <p style="color: #9ca3af; font-size: 12px;">
              If you didn't expect this invitation, you can safely ignore this email.
            </p>
          </div>
        </div>
      `,
      text: `
You're invited to join ${params.inviterName}'s team "${params.teamName}" in FaithIQ!

Team up with 2 other players and compete in real-time Bible trivia. Test your knowledge and have fun learning together!

Click here to join: ${process.env.CLIENT_URL || 'http://localhost:5000'}/game?invitation=${params.invitationId}

This invitation will expire in 5 minutes. Join quickly!

If you didn't expect this invitation, you can safely ignore this email.
      `
    };

    await sgMail.send(msg);
    console.log('Team invitation email sent successfully');
    return true;
  } catch (error) {
    console.error('Failed to send team invitation email:', error);
    return false;
  }
}