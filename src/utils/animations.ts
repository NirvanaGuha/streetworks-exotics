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

    // One stop per review: hold, then slide to the next, however many WordPress has.
    const slides = track.querySelectorAll(".review-panel").length;
    tl.to(fadeLayer, { autoAlpha: 1, duration: 0.5 });
    for (let i = 1; i < slides; i++) {
        tl.to({}, { duration: 1.0 });
        tl.to(track, { x: () => `-${i * 100}vw`, duration: 2.0, ease: "none" });
    }

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

/**
 * Featured-build sections (components/ShowcaseStory.astro): each fades in, its photo drifts,
 * its description fills with colour and its gallery images float at different speeds.
 */
export function createShowcaseAnimations() {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduceMotion) gsap.utils.toArray(".showcase-bg").forEach((bg) => {
        const htmlBg = bg as HTMLElement;
        gsap.to(htmlBg, {
            yPercent: 15,
            ease: "none",
            scrollTrigger: {
                trigger: htmlBg.closest("section"),
                start: "top bottom",
                end: "bottom top",
                scrub: true,
            },
        });
    });

    gsap.utils.toArray(".reveal-text").forEach((text) => {
        const htmlText = text as HTMLElement;
        gsap.fromTo(htmlText, { backgroundPosition: "0% 100%" }, {
                backgroundPosition: "0% 0%",
                ease: "none",
                scrollTrigger: {
                    trigger: htmlText,
                    start: "top 85%",
                    end: "bottom 45%",
                    scrub: true,
                },
            },
        );
    });

    let mm = gsap.matchMedia();
    mm.add("(min-width: 768px) and (prefers-reduced-motion: no-preference)", () => {
        gsap.utils.toArray(".gallery-zoomable").forEach((container, index) => {
            const htmlContainer = container as HTMLElement;
            const travelDistance = index % 2 === 0 ? 180 : 80;
            gsap.fromTo(htmlContainer, { y: travelDistance }, {
                    y: -travelDistance,
                    ease: "none",
                    scrollTrigger: {
                        trigger: htmlContainer,
                        start: "top bottom",
                        end: "bottom top",
                        scrub: 1.2,
                    },
                },
            );
        });
    });

    mm.add("(max-width: 767px) and (prefers-reduced-motion: no-preference)", () => {
        gsap.utils.toArray(".gallery-zoomable").forEach((container, index) => {
            const htmlContainer = container as HTMLElement;
            const travelDistance = index % 2 === 0 ? 40 : 20;
            gsap.fromTo(htmlContainer, { y: travelDistance }, {
                    y: -travelDistance,
                    ease: "none",
                    scrollTrigger: {
                        trigger: htmlContainer,
                        start: "top bottom",
                        end: "bottom top",
                        scrub: 1.2,
                    },
                },
            );
        });
    });

    gsap.utils.toArray('[id^="showcase-"]').forEach((showcase) => {
        const htmlShowcase = showcase as HTMLElement;
        gsap.to(htmlShowcase, {
            opacity: 1,
            ease: "none",
            scrollTrigger: {
                trigger: htmlShowcase,
                start: "top top",
                end: "+=100vh",
                scrub: true,
            },
        });
    });
}

/**
 * Elements that rise in once as they reach the lower part of the screen: article blocks
 * (`.article-reveal`) and listing cards. Pass the selector to reveal.
 */
export function revealOnScroll(selector: string) {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    gsap.utils.toArray<HTMLElement>(selector).forEach((el) => {
        gsap.fromTo(el, { autoAlpha: 0, y: reduceMotion ? 0 : 32 }, {
            autoAlpha: 1,
            y: 0,
            duration: 0.9,
            ease: "power3.out",
            scrollTrigger: { trigger: el, start: "top 90%", once: true },
        });
    });
}

/**
 * Article heroes (components/ArticleHero.astro): the title and details rise in, and the
 * photo pushes in slowly inside its frame as the page scrolls past.
 */
export function createArticleHeroTimeline(hero: HTMLElement) {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const copy = hero.querySelector(".article-hero-copy");
    if (copy) gsap.from(copy.children, { autoAlpha: 0, y: reduceMotion ? 0 : 30, duration: 0.9, stagger: 0.08, ease: "power3.out" });
    const frame = hero.querySelector(".article-hero-frame");
    if (frame && !reduceMotion) {
        gsap.fromTo(frame.querySelector(".article-hero-image"), { scale: 1 }, {
            scale: 1.1,
            ease: "none",
            scrollTrigger: { trigger: frame, start: "top bottom", end: "bottom top", scrub: true },
        });
    }
}
