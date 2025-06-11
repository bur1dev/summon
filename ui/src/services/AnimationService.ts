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
}