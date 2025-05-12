<script lang="ts">
    import "@holochain-open-dev/profiles/dist/elements/update-profile.js";
    import "@shoelace-style/shoelace/dist/components/dialog/dialog.js";
    import { createEventDispatcher } from "svelte";

    // Export open/close methods
    export const close = () => {
        if (dialog) dialog.hide();
    };
    export const open = () => {
        if (dialog) dialog.show();
    };

    // Dialog reference
    let dialog;

    // Event dispatcher
    const dispatch = createEventDispatcher();

    // Handle profile updated event
    function handleProfileUpdated(event) {
        console.log("Profile updated:", event);
        dispatch("profile-updated", event.detail);
        close();
    }
</script>

<sl-dialog bind:this={dialog}>
    <div class="dialog-content">
        <div class="dialog-header">
            <div class="logo-container">
                <span class="app-logo">SUMN.</span>
            </div>
            <h2>Edit Profile</h2>
        </div>
        <div class="profile-wrapper">
            <update-profile
                on:cancel-edit-profile={close}
                on:profile-updated={handleProfileUpdated}
            ></update-profile>
        </div>
    </div>
</sl-dialog>

<style>
    /* Dialog styling */
    sl-dialog::part(base) {
        --sl-panel-background-color: var(--background, #f2fffe);
        --sl-color-primary-600: var(--primary, #00cfbb);
        --sl-input-border-color: var(--border, #ccf2ee);
        --sl-input-border-color-hover: var(--primary, #00cfbb);
        --sl-input-border-color-focus: var(--primary, #00cfbb);
        --sl-input-border-radius-medium: var(--btn-border-radius, 50px);
        --sl-focus-ring-color: var(--primary, #00cfbb);
    }

    sl-dialog::part(overlay) {
        z-index: var(--z-index-overlay, 2000);
        background-color: var(--overlay-dark, rgba(0, 0, 0, 0.5));
        animation: fadeIn var(--fade-in-duration, 0.3s) ease forwards;
    }

    sl-dialog::part(panel) {
        z-index: var(--z-index-highest, 9999);
        background: var(--background, #f2fffe);
        border-radius: var(--card-border-radius, 12px);
        max-width: 500px;
        width: 100%;
        border: var(--border-width-thin, 1px) solid var(--border, #ccf2ee);
        box-shadow: var(--shadow-medium, 0 4px 12px rgba(0, 0, 0, 0.15));
        animation: scaleIn var(--transition-normal, 300ms) ease forwards;
        padding: var(--spacing-xl, 24px);
        pointer-events: auto;
    }

    sl-dialog::part(close-button) {
        color: var(--text-secondary, #5a7a7a);
        font-size: 24px;
    }

    sl-dialog::part(close-button):hover {
        color: var(--text-primary, #1e3a3a);
    }

    /* Content styling */
    .dialog-content {
        display: flex;
        flex-direction: column;
        width: 100%;
    }

    .dialog-header {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-bottom: var(--spacing-xl, 24px);
        padding-bottom: var(--spacing-md, 16px);
        border-bottom: var(--border-width-thin, 1px) solid
            var(--border-lighter, #dff8f5);
    }

    .logo-container {
        margin-bottom: var(--spacing-md, 16px);
        transition: transform var(--transition-normal, 300ms) ease;
    }

    /* Styled text logo (replacing PNG image) */
    .app-logo {
        font-size: 45px;
        font-weight: var(--font-weight-bold, 700);
        color: var(--text-primary, #ffffff);
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        transition: transform var(--transition-normal, 300ms) ease;
        display: inline-block;
    }

    .dialog-header h2 {
        margin: 0;
        font-size: var(--font-size-lg, 20px);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--text-primary, #1e3a3a);
    }

    .profile-wrapper {
        width: 100%;
    }

    /* Fix for Shoelace dialog z-index */
    :global(sl-dialog) {
        --sl-z-index-dialog: var(--z-index-highest, 9999);
    }

    /* Shoelace component styling */
    :global(update-profile) {
        /* Input styling */
        --sl-input-height-medium: var(--btn-height-md, 50px);
        --sl-input-color: var(--text-primary, #1e3a3a);
        --sl-input-placeholder-color: var(--text-secondary, #5a7a7a);
        --sl-input-background-color: var(--surface, #ffffff);
        --sl-input-border-color: var(--border, #ccf2ee);
        --sl-input-border-color-hover: var(--primary, #00cfbb);
        --sl-input-border-color-focus: var(--primary, #00cfbb);
        --sl-input-border-radius-medium: var(--btn-border-radius, 50px);
        --sl-focus-ring-color: var(--primary, #00cfbb);

        /* Font styling */
        --sl-font-family: var(
            --font-family,
            "Plus Jakarta Sans",
            -apple-system,
            BlinkMacSystemFont,
            sans-serif
        );

        /* Button styling - all buttons */
        --sl-button-font-size-medium: var(--font-size-md, 16px);
        --sl-button-height-medium: var(--btn-height-md, 50px);
        --sl-button-border-radius-medium: var(--btn-border-radius, 50px);
        --sl-button-font-weight-medium: var(--font-weight-semibold, 600);
        --sl-transition-medium: var(--btn-transition, all 0.25s ease);

        /* Primary button styling */
        --sl-color-primary-500: var(--primary, #00cfbb) !important;
        --sl-color-primary-600: var(--primary-dark, #00b3a1) !important;
        --sl-color-primary-950: var(--primary-dark, #00b3a1) !important;
        --sl-color-primary-text: var(--button-text, #ffffff) !important;

        /* Default button */
        --sl-color-neutral-0: var(--surface, #ffffff) !important;
        --sl-color-neutral-400: var(--border, #ccf2ee) !important;
        --sl-color-neutral-700: var(--text-primary, #1e3a3a) !important;
    }

    /* Direct button part styling for gradient and effects */
    :global(update-profile) ::part(button) {
        transition: all 0.25s ease !important;
    }

    :global(update-profile form) sl-button[variant="primary"]::part(base) {
        background: linear-gradient(
            135deg,
            var(--primary, #00cfbb),
            var(--secondary, #8d72e1)
        ) !important;
        border-color: transparent !important;
        box-shadow: var(
            --shadow-button,
            0 4px 5px rgba(0, 0, 0, 0.2)
        ) !important;
        transition: var(--btn-transition, all 0.25s ease) !important;
    }

    :global(update-profile form)
        sl-button[variant="primary"]::part(base):hover {
        background: linear-gradient(
            135deg,
            var(--primary-dark, #00b3a1),
            var(--secondary, #8d72e1)
        ) !important;
        transform: translateY(var(--hover-lift, -2px)) !important;
        box-shadow: var(
            --shadow-medium,
            0 4px 12px rgba(0, 0, 0, 0.15)
        ) !important;
    }

    :global(update-profile form) sl-button[variant="default"]::part(base) {
        background: var(--background, #f2fffe) !important;
        color: var(--text-primary, #1e3a3a) !important;
        border: var(--border-width-thin, 1px) solid var(--border, #ccf2ee) !important;
        border-radius: var(--btn-border-radius, 50px) !important;
        box-shadow: var(
            --shadow-subtle,
            0 2px 8px rgba(0, 0, 0, 0.08)
        ) !important;
        transition: var(--btn-transition, all 0.25s ease) !important;
    }

    :global(update-profile form)
        sl-button[variant="default"]::part(base):hover {
        background: var(--surface, #ffffff) !important;
        border-color: var(--primary, #00cfbb) !important;
        transform: translateY(var(--hover-lift, -2px)) !important;
        box-shadow: var(
            --shadow-medium,
            0 4px 12px rgba(0, 0, 0, 0.15)
        ) !important;
    }

    /* Input field styling */
    :global(update-profile) sl-input::part(base),
    :global(update-profile) sl-textarea::part(base) {
        border-radius: var(--btn-border-radius, 50px) !important;
        border: var(--border-width-thin, 1px) solid var(--border, #ccf2ee) !important;
        transition: var(--btn-transition, all 0.25s ease) !important;
    }

    :global(update-profile) sl-input::part(base):hover,
    :global(update-profile) sl-textarea::part(base):hover {
        border-color: var(--primary, #00cfbb) !important;
    }

    :global(update-profile) sl-input::part(base):focus-within,
    :global(update-profile) sl-textarea::part(base):focus-within {
        border-color: var(--primary, #00cfbb) !important;
        box-shadow: var(
            --shadow-subtle,
            0 2px 8px rgba(0, 0, 0, 0.08)
        ) !important;
    }

    /* Custom animations */
    @keyframes scaleIn {
        from {
            opacity: 0;
            transform: scale(0.9);
        }
        to {
            opacity: 1;
            transform: scale(1);
        }
    }

    @keyframes fadeIn {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }
</style>
