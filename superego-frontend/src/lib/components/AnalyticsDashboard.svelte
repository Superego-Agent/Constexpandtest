<!-- src/lib/components/AnalyticsDashboard.svelte -->
<script lang="ts">
    import { onMount } from 'svelte';
    import Chart from 'chart.js/auto';
    import { formatNumber } from '$lib/utils/utils';
    
    // Props
    const { constitutionId } = $props<{
        constitutionId: string;
    }>();
    
    // State
    let isLoading = $state(true);
    let error = $state<string | null>(null);
    let analyticsData = $state<any | null>(null);
    let viewsChart: Chart | null = $state(null);
    let period = $state<'day' | 'week' | 'month'>('week');
    
    // Load analytics data
    async function loadAnalytics() {
        isLoading = true;
        error = null;
        
        try {
            const response = await fetch(`/api/analytics/summary/${constitutionId}`);
            if (!response.ok) {
                throw new Error(`Failed to load analytics: ${response.statusText}`);
            }
            
            analyticsData = await response.json();
            
            // Initialize chart after data is loaded
            setTimeout(() => {
                if (analyticsData) {
                    initViewsChart();
                }
            }, 0);
        } catch (err) {
            console.error('Error loading analytics:', err);
            error = err instanceof Error ? err.message : String(err);
        } finally {
            isLoading = false;
        }
    }
    
    // Initialize views trend chart
    function initViewsChart() {
        if (!analyticsData?.views_trend) return;
        
        const ctx = document.getElementById('viewsChart') as HTMLCanvasElement;
        if (!ctx) return;
        
        // Destroy existing chart if it exists
        if (viewsChart) {
            viewsChart.destroy();
        }
        
        // Prepare data
        const labels = Object.keys(analyticsData.views_trend);
        const data = Object.values(analyticsData.views_trend);
        
        // Create new chart
        viewsChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels.map(d => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
                datasets: [{
                    label: 'Views',
                    data: data,
                    borderColor: '#7c3aed',
                    backgroundColor: 'rgba(124, 58, 237, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            precision: 0
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                }
            }
        });
    }
    
    // Change time period
    function changePeriod(newPeriod: 'day' | 'week' | 'month') {
        period = newPeriod;
        loadAnalytics();
    }
    
    // Calculate engagement level
    function getEngagementLevel(score: number): string {
        if (score >= 8) return 'Exceptional';
        if (score >= 6) return 'High';
        if (score >= 4) return 'Good';
        if (score >= 2) return 'Moderate';
        return 'Low';
    }
    
    // Initialize on mount
    onMount(() => {
        loadAnalytics();
        
        // Cleanup on unmount
        return () => {
            if (viewsChart) {
                viewsChart.destroy();
            }
        };
    });
</script>

<div class="analytics-dashboard">
    <header class="dashboard-header">
        <h2>Performance Analytics</h2>
        <div class="period-selector">
            <button 
                class:active={period === 'day'} 
                onclick={() => changePeriod('day')}
            >
                24 Hours
            </button>
            <button 
                class:active={period === 'week'} 
                onclick={() => changePeriod('week')}
            >
                Week
            </button>
            <button 
                class:active={period === 'month'} 
                onclick={() => changePeriod('month')}
            >
                Month
            </button>
        </div>
    </header>
    
    {#if isLoading}
        <div class="loading-state">
            <div class="spinner"></div>
            <p>Loading analytics data...</p>
        </div>
    {:else if error}
        <div class="error-state">
            <p>Error: {error}</p>
            <button onclick={loadAnalytics}>Retry</button>
        </div>
    {:else if analyticsData}
        <div class="metrics-grid">
            <div class="metric-card">
                <h3>Views</h3>
                <div class="metric-value">{formatNumber(analyticsData.views)}</div>
            </div>
            
            <div class="metric-card">
                <h3>Downloads</h3>
                <div class="metric-value">{formatNumber(analyticsData.downloads)}</div>
            </div>
            
            <div class="metric-card">
                <h3>Stars</h3>
                <div class="metric-value">{formatNumber(analyticsData.stars)}</div>
            </div>
            
            <div class="metric-card">
                <h3>MCP Uses</h3>
                <div class="metric-value">{formatNumber(analyticsData.uses)}</div>
            </div>
        </div>
        
        <div class="chart-container">
            <h3>Views Trend</h3>
            <div class="chart-wrapper">
                <canvas id="viewsChart"></canvas>
            </div>
        </div>
        
        <div class="engagement-section">
            <h3>Engagement Score</h3>
            <div class="engagement-meter">
                <div class="meter-bar">
                    <div 
                        class="meter-fill" 
                        style="width: {analyticsData.engagement_score * 10}%;"
                        class:high={analyticsData.engagement_score >= 6}
                        class:medium={analyticsData.engagement_score >= 3 && analyticsData.engagement_score < 6}
                        class:low={analyticsData.engagement_score < 3}
                    ></div>
                </div>
                <div class="meter-value">
                    <span class="score">{analyticsData.engagement_score.toFixed(1)}</span>
                    <span class="max">/10</span>
                </div>
            </div>
            <p class="engagement-level">
                Engagement Level: <strong>{getEngagementLevel(analyticsData.engagement_score)}</strong>
            </p>
        </div>
    {:else}
        <div class="empty-state">
            <p>No analytics data available.</p>
        </div>
    {/if}
</div>

<style lang="scss">
    @use '../styles/mixins' as *;

    .analytics-dashboard {
        @include base-card();
        padding: var(--space-md);
    }
    
    .dashboard-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-md);
        
        h2 {
            font-size: 1.2rem;
            margin: 0;
        }
    }
    
    .period-selector {
        display: flex;
        gap: 2px;
        
        button {
            padding: 5px 10px;
            background-color: var(--bg-surface);
            border: 1px solid var(--input-border);
            font-size: 0.8rem;
            cursor: pointer;
            
            &:first-child {
                border-radius: var(--radius-sm) 0 0 var(--radius-sm);
            }
            
            &:last-child {
                border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
            }
            
            &.active {
                background-color: var(--primary);
                color: white;
                border-color: var(--primary);
            }
        }
    }
    
    .loading-state, .error-state, .empty-state {
        text-align: center;
        padding: var(--space-lg);
        
        .spinner {
            @include loading-spinner();
            margin: 0 auto var(--space-md);
        }
    }
    
    .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: var(--space-md);
        margin-bottom: var(--space-md);
    }
    
    .metric-card {
        background-color: var(--bg-elevated);
        padding: var(--space-md);
        border-radius: var(--radius-md);
        text-align: center;
        
        h3 {
            font-size: 0.9rem;
            margin: 0 0 var(--space-sm);
            color: var(--text-secondary);
        }
        
        .metric-value {
            font-size: 1.8rem;
            font-weight: 600;
            color: var(--text-primary);
        }
    }
    
    .chart-container {
        margin-bottom: var(--space-md);
        
        h3 {
            font-size: 1rem;
            margin-bottom: var(--space-sm);
        }
        
        .chart-wrapper {
            height: 200px;
            position: relative;
        }
    }
    
    .engagement-section {
        background-color: var(--bg-elevated);
        padding: var(--space-md);
        border-radius: var(--radius-md);
        
        h3 {
            font-size: 1rem;
            margin-bottom: var(--space-sm);
        }
        
        .engagement-meter {
            display: flex;
            align-items: center;
            gap: var(--space-md);
            margin-bottom: var(--space-sm);
            
            .meter-bar {
                flex-grow: 1;
                height: 10px;
                background-color: var(--bg-surface);
                border-radius: var(--radius-pill);
                overflow: hidden;
                
                .meter-fill {
                    height: 100%;
                    background-color: var(--primary);
                    border-radius: var(--radius-pill);
                    
                    &.high {
                        background-color: var(--success);
                    }
                    
                    &.medium {
                        background-color: var(--warning);
                    }
                    
                    &.low {
                        background-color: var(--error);
                    }
                }
            }
            
            .meter-value {
                font-size: 1.2rem;
                font-weight: 600;
                
                .max {
                    font-weight: normal;
                    opacity: 0.7;
                }
            }
        }
        
        .engagement-level {
            font-size: 0.9rem;
            color: var(--text-secondary);
            text-align: center;
        }
    }
</style>