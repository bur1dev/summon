/**
 * AnimationService - Centralized animation management
 * 
 * Provides consistent animation utilities across all components.
 * Integrates with existing CSS keyframes and timing variables.
 */
export class AnimationService {
  // CSS timing constants (matches app.css variables)
  private static readonly TRANSITION_FAST = 200;
  private static readonly TRANSITION_NORMAL = 300;
  private static readonly TRANSITION_SMOOTH = 500;

  /**
   * Gets animation duration for a specific animation type
   * Used in SlideOutCart.svelte and CheckoutFlow.svelte
   */
  static getAnimationDuration(type: 'fast' | 'normal' | 'smooth'): number {
    switch (type) {
      case 'fast':
        return this.TRANSITION_FAST;
      case 'normal':
        return this.TRANSITION_NORMAL;
      case 'smooth':
        return this.TRANSITION_SMOOTH;
      default:
        return this.TRANSITION_NORMAL;
    }
  }

  /**
   * Slides out a panel (cart or sidebar) with proper animation timing
   * Used in SidebarMenu.svelte
   */
  static async slideOutPanel(
    element: HTMLElement,
    direction: 'left' | 'right'
  ): Promise<void> {
    if (!element) {
      throw new Error('Element is required for slideOutPanel animation');
    }

    // Add the slide-out animation class
    element.classList.add(`slide-out-${direction}`);

    // Wait for animation to complete using smooth timing
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, this.TRANSITION_SMOOTH);
    });
  }

  /**
   * Professional zipper animation - pure CSS approach
   * Add class to container, CSS handles the rest
   */
  static startCartZipper(container: HTMLElement): void {
    if (container) {
      container.classList.add('zipper-enter');
    }
  }

  static stopCartZipper(container: HTMLElement): void {
    if (container) {
      container.classList.add('zipper-exit');
    }
  }

  /**
   * Time slot stagger animation - dynamic infinite elements
   */
  static startTimeSlotStagger(container: HTMLElement): void {
    if (container) {
      // Set dynamic index for each time slot wrapper
      const timeSlots = container.querySelectorAll('.time-slot-wrapper');
      timeSlots.forEach((slot, index) => {
        (slot as HTMLElement).style.setProperty('--stagger-index', index.toString());
      });
      container.classList.add('stagger-enter');
    }
  }

  static stopTimeSlotStagger(container: HTMLElement): void {
    if (container) {
      // Set reverse index for exit animation
      const timeSlots = container.querySelectorAll('.time-slot-wrapper');
      const totalSlots = timeSlots.length;
      timeSlots.forEach((slot, index) => {
        const reverseIndex = totalSlots - 1 - index;
        (slot as HTMLElement).style.setProperty('--stagger-index', reverseIndex.toString());
      });
      container.classList.add('stagger-exit');
    }
  }
}