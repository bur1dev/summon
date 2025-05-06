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
            <img src="./logo.png" alt="SUMN." class="app-logo" />
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
    sl-dialog::part(panel) {
        z-index: 10000;
        background: #ffffff;
        border-radius: 8px;
        max-width: 500px;
        width: 100%;
    }

    sl-dialog::part(overlay) {
        z-index: 9999;
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
        margin-bottom: 16px;
    }

    .app-logo {
        height: 50px;
        width: auto;
        margin-bottom: 8px;
    }

    .dialog-header h2 {
        margin: 0;
        font-size: 22px;
    }

    .profile-wrapper {
        width: 100%;
    }

    /* Fix for Shoelace dialog z-index */
    :global(sl-dialog) {
        --sl-z-index-dialog: 10000;
    }
</style>
