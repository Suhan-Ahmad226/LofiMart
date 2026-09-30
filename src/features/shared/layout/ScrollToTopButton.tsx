import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

export const ScrollToTopButton = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleScroll = () => {
      const currentY = window.scrollY;
      const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
      const nextProgress = documentHeight > 0 ? Math.min(1, Math.max(0, currentY / documentHeight)) : 0;

      setIsVisible(currentY > 420);
      setScrollProgress(nextProgress);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    if (typeof window === 'undefined') return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const progressDegrees = `${Math.round(scrollProgress * 360)}deg`;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Scroll to top"
      className={`scroll-top-button ${isVisible ? 'scroll-top-button--visible' : 'scroll-top-button--hidden'}`}
      style={{ ['--scroll-progress' as string]: progressDegrees }}
    >
      <span className="scroll-top-button__progress-ring">
        <span className="scroll-top-button__icon">
          <ArrowUp size={18} />
        </span>
      </span>
      <span className="scroll-top-button__tooltip">Back to top</span>
    </button>
  );
};
