import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro:schema';
import { WP_FORM_SECRET } from 'astro:env/server';

const WP_GRAPHQL_URL = import.meta.env.PUBLIC_WP_GRAPHQL_URL;

export const server = {
    submitContactForm: defineAction({
        accept: 'form',
        input: z.object({
            name: z.string().trim().min(1, "Name is required"),
            email: z.string().trim().email("Invalid email"),
            message: z.string().trim().min(1, "Message is required"),
            // Honeypot: hidden from people, filled in by bots.
            website: z.string().optional(),
        }),
        handler: async (input, context) => {
            if (input.website) {
                return { success: true };
            }

            if (!WP_GRAPHQL_URL || !WP_FORM_SECRET) {
                throw new ActionError({
                    code: 'SERVICE_UNAVAILABLE',
                    message: "This form isn't connected yet. Please call or email us instead.",
                });
            }

            // Saved as an Enquiry in WordPress, which also emails the shop (see wordpress/fire-headless).
            const endpoint = new URL('/wp-json/fire/v1/enquiries', WP_GRAPHQL_URL);
            let res: Response;
            try {
                res = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Fire-Form-Secret': WP_FORM_SECRET,
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
