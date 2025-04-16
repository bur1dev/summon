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

<sl-dialog label="Edit Profile" bind:this={dialog}>
    <update-profile
        on:cancel-edit-profile={close}
        on:profile-updated={handleProfileUpdated}
    ></update-profile>
</sl-dialog>

<style>
    sl-dialog::part(panel) {
        background: #ffffff;
        border-radius: 8px;
        max-width: 500px;
        width: 100%;
    }
</style>
