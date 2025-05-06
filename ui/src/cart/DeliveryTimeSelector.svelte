<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import type { DeliveryTimeSlot } from "./SimpleCartService";

    // Event dispatcher
    const dispatch = createEventDispatcher();

    // Props
    export let timeSlots;
    export let selectedDate = null;
    export let selectedTimeSlot = null;

    // State
    let visibleStartIndex = 0;
    let visibleDays = [];
    let canScrollLeft = false;
    let canScrollRight = true;

    onMount(() => {
        updateVisibleDays();

        // Initialize from saved values if available
        if (selectedDate && timeSlots) {
            // Find the matching day by date
            const matchingDay = timeSlots.find(
                (day) => day.date.getTime() === selectedDate.getTime(),
            );

            if (matchingDay && selectedTimeSlot) {
                // Find the matching time slot by slot value
                const matchingSlot = matchingDay.timeSlots.find(
                    (slot) => slot.slot === selectedTimeSlot,
                );

                if (matchingSlot) {
                    selectedTimeSlot = matchingSlot;
                }
            }
        }
    });

    // Update which days are visible in the carousel
    function updateVisibleDays() {
        // Always show 3 days starting from visibleStartIndex
        const endIdx = Math.min(timeSlots.length, visibleStartIndex + 3);
        visibleDays = timeSlots.slice(visibleStartIndex, endIdx);

        // Enable/disable scroll buttons
        canScrollLeft = visibleStartIndex > 0;
        canScrollRight = visibleStartIndex < timeSlots.length - 3;
    }

    // Handle date selection (only selects, doesn't navigate)
    function selectDate(date) {
        selectedDate = date;
        selectedTimeSlot = null; // Reset time slot when date changes
        dispatchSelection();
    }

    // Handle time slot selection
    function selectTimeSlot(timeSlot) {
        selectedTimeSlot = timeSlot;
        dispatchSelection();
    }

    // Dispatch the selection event
    function dispatchSelection() {
        if (selectedDate && selectedTimeSlot) {
            const deliveryTime: DeliveryTimeSlot = {
                date: selectedDate.getTime(),
                time_slot: selectedTimeSlot.slot,
            };

            dispatch("select", { deliveryTime });
        }
    }

    // Scroll date carousel - only changes which days are visible
    function scrollDates(direction) {
        if (direction === "left" && canScrollLeft) {
            visibleStartIndex -= 1;
        } else if (direction === "right" && canScrollRight) {
            visibleStartIndex += 1;
        }

        updateVisibleDays();
    }

    // Find currently visible time slots for the selected date
    $: currentDateTimeSlots =
        timeSlots.find(
            (d) => selectedDate && d.date.getTime() === selectedDate.getTime(),
        )?.timeSlots || [];

    // Update visible days when slots change
    $: {
        if (timeSlots) {
            updateVisibleDays();
        }
    }
</script>

<div class="delivery-time-selector">
    <div class="delivery-time-header">
        <h2>Choose Delivery Time</h2>
    </div>

    <div class="date-selector">
        <button
            class="scroll-button left {canScrollLeft ? '' : 'disabled'}"
            on:click={() => scrollDates("left")}
            disabled={!canScrollLeft}
        >
            ←
        </button>

        <div class="date-cards-container">
            {#each visibleDays as day}
                <div
                    class="date-card {selectedDate &&
                    day.date.getTime() === selectedDate.getTime()
                        ? 'selected'
                        : ''}"
                    on:click={() => selectDate(day.date)}
                >
                    <div class="date-card-day">{day.dayOfWeek}</div>
                    <div class="date-card-date">{day.dateFormatted}</div>
                </div>
            {/each}
        </div>

        <button
            class="scroll-button right {canScrollRight ? '' : 'disabled'}"
            on:click={() => scrollDates("right")}
            disabled={!canScrollRight}
        >
            →
        </button>
    </div>

    {#if selectedDate}
        <div class="time-slots-container">
            <div class="time-slots-header">Select a delivery time</div>

            <div class="time-slots-grid">
                {#each currentDateTimeSlots as timeSlot}
                    <div
                        class="time-slot {selectedTimeSlot &&
                        (typeof selectedTimeSlot === 'string'
                            ? selectedTimeSlot === timeSlot.slot
                            : selectedTimeSlot.id === timeSlot.id)
                            ? 'selected'
                            : ''}"
                        on:click={() => selectTimeSlot(timeSlot)}
                    >
                        <div class="time-slot-time">{timeSlot.display}</div>
                    </div>
                {/each}
            </div>
        </div>
    {/if}
</div>

<style>
    .delivery-time-selector {
        background: white;
        border-radius: 8px;
        width: 100%;
    }

    .delivery-time-header {
        padding: 16px;
        border-bottom: 1px solid #f0f0f0;
    }

    .delivery-time-header h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
    }

    .date-selector {
        display: flex;
        align-items: center;
        padding: 16px;
        border-bottom: 1px solid #f0f0f0;
        position: relative;
    }

    .date-cards-container {
        display: flex;
        flex: 1;
        justify-content: center;
        gap: 12px;
        overflow: hidden;
    }

    .date-card {
        min-width: 90px;
        flex: 1;
        text-align: center;
        padding: 12px 8px;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        cursor: pointer;
        transition:
            background-color 0.2s,
            border-color 0.2s;
    }

    .date-card:hover {
        background-color: #f9f9f9;
    }

    .date-card.selected {
        border-color: rgb(61, 61, 61);
        background-color: rgba(26, 139, 81, 0.05);
    }

    .date-card-day {
        font-weight: 600;
        margin-bottom: 4px;
        font-size: 14px;
    }

    .date-card-date {
        font-size: 14px;
        color: #666;
    }

    .scroll-button {
        background: #f5f5f5;
        border: 1px solid #e0e0e0;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        margin: 0 8px;
        font-size: 14px;
        color: #333;
        transition: background-color 0.2s;
    }

    .scroll-button:hover:not(.disabled) {
        background-color: #e0e0e0;
    }

    .scroll-button.disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    .time-slots-container {
        padding: 16px;
    }

    .time-slots-header {
        margin-bottom: 16px;
        font-weight: 500;
        color: #333;
    }

    .time-slots-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 12px;
    }

    .time-slot {
        padding: 12px;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        cursor: pointer;
        text-align: center;
        transition:
            background-color 0.2s,
            border-color 0.2s;
    }

    .time-slot:hover {
        background-color: #f9f9f9;
    }

    .time-slot.selected {
        border-color: rgb(61, 61, 61);
        background-color: rgba(26, 139, 81, 0.05);
    }

    .time-slot-time {
        font-size: 14px;
        font-weight: 500;
    }
</style>
