import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro:schema';
import { WP_FORM_SECRET } from 'astro:env/server';
import { getBusiness } from '../lib/business';
import { demoMode } from '../lib/demo';

const WP_GRAPHQL_URL = import.meta.env.PUBLIC_WP_GRAPHQL_URL;

// The visitor's address as the host saw it. On Vercel, x-real-ip is set by the platform
// and can't be supplied by the visitor; elsewhere Astro's own value is used.
function clientAddress(context: { request: Request; clientAddress?: string }) {
    const fromVercel = process.env.VERCEL ? context.request.headers.get('x-real-ip') : null;
    if (fromVercel) return fromVercel;
    try {
        return context.clientAddress || '';
    } catch {
        return '';
    }
}

export const server = {
    submitContactForm: defineAction({
        accept: 'form',
        input: z.object({
            // Limits match the form's maxlength and the WordPress endpoint.
            name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
            email: z.string().trim().max(254, "Email is too long").email("Invalid email"),
            message: z.string().trim().min(1, "Message is required").max(5000, "Message is too long (5,000 characters at most)"),
            // Honeypot: hidden from people, filled in by bots.
            website: z.string().max(200).optional(),
            // Milliseconds the visitor spent on the form, set by the page script.
            elapsed: z.coerce.number().optional(),
        }),
        handler: async (input, context) => {
            // Bots get a normal-looking success so they don't adapt: they fill the hidden field,
            // skip the page script (no elapsed time) or submit faster than anyone can type.
            if (input.website || !input.elapsed || input.elapsed < 2500) {
                return { success: true };
            }

            if (!WP_GRAPHQL_URL || !WP_FORM_SECRET) {
                const { phone, email } = await getBusiness();
                throw new ActionError({
                    code: 'SERVICE_UNAVAILABLE',
                    message: demoMode
                        ? `This is a concept preview, so messages aren't sent yet. Please call ${phone} or email ${email}.`
                        : `This form isn't connected yet. Please call ${phone} or email ${email}.`,
                });
            }

            // Saved as an Enquiry in WordPress, which also emails the shop (see wordpress/fire-headless).
            const endpoint = new URL('/wp-json/fire/v1/enquiries', WP_GRAPHQL_URL);
            // The shared secret travels with every enquiry, so only over HTTPS (local WordPress excepted).
            if (endpoint.protocol !== 'https:' && !/^(localhost|127\.0\.0\.1|\[::1\])$|\.(local|test|localhost)$/.test(endpoint.hostname)) {
                console.error('[contact] Refusing to send the form secret over plain HTTP:', endpoint.origin);
                throw new ActionError({ code: 'INTERNAL_SERVER_ERROR', message: "Sorry, your message didn't go through. Please call us instead." });
            }
            let res: Response;
            try {
                res = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Fire-Form-Secret': WP_FORM_SECRET,
                        // Lets WordPress rate-limit per visitor; it stores only a hash of it.
                        'X-Fire-Client-IP': clientAddress(context),
                    },
                    body: JSON.stringify({
                        name: input.name,
                        email: input.email,
                        message: input.message,
                        page: context.request.headers.get('referer') || '',
                    }),
                });
            } catch (error) {
                console.error('[contact] WordPress unreachable:', error);
                res = new Response(null, { status: 503 });
            }

            if (res.status === 429) {
                throw new ActionError({
                    code: 'TOO_MANY_REQUESTS',
                    message: "You've sent several messages in a short time. Please wait a few minutes, or call us.",
                });
            }

            if (!res.ok) {
                console.error(`[contact] WordPress rejected the enquiry: ${res.status} ${await res.text().catch(() => '')}`);
                throw new ActionError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: "Sorry, your message didn't go through. Please try again or call us.",
                });
            }

            return { success: true };
        }
    })
};
