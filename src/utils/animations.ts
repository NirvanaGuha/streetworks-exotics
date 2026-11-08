import { gsap } from "gsap";

/**
 * Shared logic for the horizontal reviews "melt" animation.
 */
export function createReviewsTimeline(container: HTMLElement) {
    const track = container.querySelector("#reviews-track") as HTMLElement;
    const fadeLayer = container.querySelector("#reviews-fade-layer") as HTMLElement;

    if (!container || !track || !fadeLayer) return;

    const tl = gsap.timeline({
        scrollTrigger: {
            trigger: container,
            start: "top top",
            end: "bottom bottom",
            scrub: 1,
            invalidateOnRefresh: true,
        },
    });

    tl.to(fadeLayer, { autoAlpha: 1, duration: 0.5 });
    tl.to({}, { duration: 1.0 });
    tl.to(track, {
        x: () => "-100vw",
        duration: 2.0,
        ease: "none",
    });
    tl.to({}, { duration: 1.0 });
    tl.to(track, {
        x: () => "-200vw",
        duration: 2.0,
        ease: "none",
    });

    tl.to({}, { duration: 2.0 });
    tl.to(fadeLayer, { autoAlpha: 0, duration: 0.5 });
    
    return tl;
}

/**
 * Shared logic for the scroll-linked text block reveals.
 * We pass the triggerStart so we can use "top top" for standalone blocks
 * and "100vh top" for blocks revealed from under a curtain.
 */
export function createTextBlockTimeline(container: HTMLElement, triggerStart: string = "100vh top") {
    const layer = container.querySelector('[id$="-layer"], .text-block-layer') as HTMLElement;
    const words = container.querySelectorAll(".reveal-word");
    const revealText = container.querySelector('.text-reveal-gradient') as HTMLElement;

    if (!layer || !revealText) return;

    const tl = gsap.timeline({
        scrollTrigger: {
            trigger: container,
            start: triggerStart,
            end: "bottom bottom",
            scrub: 1,
        },
    });

    tl.to(layer, { autoAlpha: 1, duration: 0.1 }, 0);
    
    tl.fromTo(
        revealText,
        { autoAlpha: 0, scale: 0.95 },
        { autoAlpha: 1, scale: 1, duration: 0.2 },
        0
    );

    if (words.length) {
        tl.to(
            words,
            {
                opacity: 1,
                duration: 0.2,
                stagger: { amount: 1.2 },
                ease: "power2.out",
            },
            0
        );
    }
    
    tl.to(
        revealText,
        {
            backgroundPosition: "-200% 0%",
            duration: 1.4,
            ease: "none",
        },
        0
    );

    tl.to(revealText, { autoAlpha: 0, scale: 0.95, duration: 0.3 }, 1.8);
    tl.to(layer, { autoAlpha: 0, duration: 0.1 }, 2.0);

    return tl;
}
