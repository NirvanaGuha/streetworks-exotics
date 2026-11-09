/**
 * Scroll animations for post and case study pages: the hero lifts away and the content and
 * cards rise in. Imported by both page templates; the module runs once, so it registers one
 * listener however the visitor moves between them.
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { createArticleHeroTimeline, revealOnScroll } from "./animations";

gsap.registerPlugin(ScrollTrigger);

document.addEventListener("astro:page-load", () => {
    const hero = document.querySelector<HTMLElement>(".article-hero");
    if (!hero) return;
    ScrollTrigger.getAll().forEach((t) => t.kill());
    createArticleHeroTimeline(hero);
    revealOnScroll(".article-reveal, .listing-reveal");
});
