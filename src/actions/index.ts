import { defineAction } from 'astro:actions';
import { z } from 'astro:schema';

export const server = {
    submitContactForm: defineAction({
        accept: 'form',
        input: z.object({
            name: z.string().min(1, "Name is required"),
            email: z.string().email("Invalid email"),
            message: z.string().min(1, "Message is required"),
        }),
        handler: async (input) => {
            console.log('Received contact form submission:', input);
            // Simulate processing time
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            return {
                success: true,
                message: "Thanks! We'll be in touch soon."
            };
        }
    })
};
