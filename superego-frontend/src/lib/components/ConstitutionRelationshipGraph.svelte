<script lang="ts">
    import { onMount } from 'svelte';
    import { fetchConstitutionContent } from '$lib/api/rest.svelte';
    import { constitutionStore } from '$lib/state/constitutions.svelte';
    import * as d3 from 'd3';
    
    // Props
    const { 
        constitutionId = undefined, 
        width = 800, 
        height = 500 
    } = $props<{
        constitutionId?: string;
        width?: number;
        height?: number;
    }>();
    
    // Component state
    let isLoading = $state(true);
    let error = $state<string | null>(null);
    let svg: SVGSVGElement | null = $state(null);
    let relationshipsData = $state<RelationshipData | null>(null);
    
    // Graph data types
    interface Node {
        id: string;
        title: string;
        type: 'original' | 'derived' | 'similar' | 'focus';
        description?: string;
    }
    
    interface Link {
        source: string;
        target: string;
        type: 'derives' | 'similar' | 'references';
        strength: number; // 0-1 value indicating relationship strength
    }
    
    interface RelationshipData {
        nodes: Node[];
        links: Link[];
    }
    
    // On mount, fetch relationship data and initialize visualization
    onMount(async () => {
        try {
            // In a real implementation, this would call an API endpoint
            // For now, we'll create mock data based on the constitution ID
            const data = await fetchRelationshipData(constitutionId);
            relationshipsData = data;
            
            // Initialize the graph once data is loaded
            if (svg) {
                renderGraph();
            }
        } catch (err) {
            console.error('Error fetching relationship data:', err);
            error = `Failed to load relationship data: ${err instanceof Error ? err.message : String(err)}`;
        } finally {
            isLoading = false;
        }
    });
    
    // When the SVG element is bound or data changes, render the graph
    $effect(() => {
        if (svg && relationshipsData && !isLoading) {
            renderGraph();
        }
    });
    
    // Function to fetch relationship data
    async function fetchRelationshipData(id?: string): Promise<RelationshipData> {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // Mock data - in a real implementation, fetch from API
        // Generate a network of relationships centered around the focus constitution
        const nodes: Node[] = [];
        const links: Link[] = [];
        
        // Add focus node
        const focusTitle = id ? 
            constitutionStore.localConstitutions.find(c => c.localStorageKey === id)?.title || 
            'Selected Constitution' : 
            'Sample Constitution';
            
        nodes.push({
            id: id || 'focus',
            title: focusTitle,
            type: 'focus',
            description: 'The currently focused constitution'
        });
        
        // Add derived nodes (constitutions based on this one)
        for (let i = 1; i <= 3; i++) {
            const derivedId = `derived-${i}`;
            nodes.push({
                id: derivedId,
                title: `Derived ${i}: ${focusTitle} (Modified)`,
                type: 'derived',
                description: `A constitution that builds upon ${focusTitle}`
            });
            
            links.push({
                source: id || 'focus',
                target: derivedId,
                type: 'derives',
                strength: 0.8 - (i * 0.1) // Weaker for each step away
            });
        }
        
        // Add original nodes (constitutions this one is based on)
        for (let i = 1; i <= 2; i++) {
            const originalId = `original-${i}`;
            nodes.push({
                id: originalId,
                title: `Original ${i}: Foundational Framework`,
                type: 'original',
                description: 'A constitution that influenced this one'
            });
            
            links.push({
                source: originalId,
                target: id || 'focus',
                type: 'derives',
                strength: 0.7
            });
        }
        
        // Add similar nodes (constitutions that are similar but not directly related)
        for (let i = 1; i <= 5; i++) {
            const similarId = `similar-${i}`;
            nodes.push({
                id: similarId,
                title: `Similar ${i}: Related Approach`,
                type: 'similar',
                description: 'A constitution with similar concepts or language'
            });
            
            links.push({
                source: id || 'focus',
                target: similarId,
                type: 'similar',
                strength: 0.9 - (i * 0.15) // Varying similarity strength
            });
        }
        
        // Add some interconnections between similar and derived nodes
        links.push({
            source: 'similar-1',
            target: 'derived-2',
            type: 'references',
            strength: 0.4
        });
        
        links.push({
            source: 'derived-1',
            target: 'similar-3',
            type: 'similar',
            strength: 0.5
        });
        
        return { nodes, links };
    }
    
    // Function to render the graph visualization
    function renderGraph() {
        if (!svg || !relationshipsData) return;
        
        // Clear any existing elements
        d3.select(svg).selectAll("*").remove();
        
        const { nodes, links } = relationshipsData;
        
        // Create a force simulation
        const simulation = d3.forceSimulation(nodes as any)
            .force("link", d3.forceLink(links as any).id((d: any) => d.id).distance(100))
            .force("charge", d3.forceManyBody().strength(-300))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("collide", d3.forceCollide().radius(60));
        
        // Create a container group for all elements
        const g = d3.select(svg).append("g");
        
        // Add zoom behavior
        const zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on("zoom", (event) => {
                g.attr("transform", event.transform);
            });
        
        d3.select(svg).call(zoom as any);
        
        // Define marker for arrows
        d3.select(svg).append("defs").selectAll("marker")
            .data(["derives", "similar", "references"])
            .enter().append("marker")
            .attr("id", d => `arrow-${d}`)
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 15)
            .attr("refY", 0)
            .attr("markerWidth", 6)
            .attr("markerHeight", 6)
            .attr("orient", "auto")
            .append("path")
            .attr("d", "M0,-5L10,0L0,5")
            .attr("fill", d => getColorForLinkType(d));
        
        // Draw links
        const link = g.append("g")
            .selectAll("line")
            .data(links)
            .enter().append("line")
            .attr("stroke-width", d => Math.max(1, d.strength * 4))
            .attr("stroke", d => getColorForLinkType(d.type))
            .attr("stroke-opacity", 0.6)
            .attr("stroke-dasharray", d => d.type === 'similar' ? "5,5" : null)
            .attr("marker-end", d => `url(#arrow-${d.type})`);
        
        // Create node groups
        const node = g.append("g")
            .selectAll(".node")
            .data(nodes)
            .enter().append("g")
            .attr("class", "node")
            .call(d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended) as any);
        
        // Add circles for nodes
        node.append("circle")
            .attr("r", d => d.type === 'focus' ? 25 : 20)
            .attr("fill", d => getColorForNodeType(d.type))
            .attr("stroke", "white")
            .attr("stroke-width", 2);
        
        // Add labels to nodes
        node.append("text")
            .attr("dy", 30)
            .attr("text-anchor", "middle")
            .text(d => truncateText(d.title, 20))
            .attr("fill", "var(--text-primary)")
            .attr("font-size", "10px");
        
        // Add tooltips on hover
        node.append("title")
            .text(d => `${d.title}\n${d.description || ''}`);
        
        // Update positions on each tick of the simulation
        simulation.on("tick", () => {
            link
                .attr("x1", (d: any) => d.source.x)
                .attr("y1", (d: any) => d.source.y)
                .attr("x2", (d: any) => d.target.x)
                .attr("y2", (d: any) => d.target.y);
            
            node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
        });
        
        // Drag functions
        function dragstarted(event: any) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            event.subject.fx = event.subject.x;
            event.subject.fy = event.subject.y;
        }
        
        function dragged(event: any) {
            event.subject.fx = event.x;
            event.subject.fy = event.y;
        }
        
        function dragended(event: any) {
            if (!event.active) simulation.alphaTarget(0);
            event.subject.fx = null;
            event.subject.fy = null;
        }
    }
    
    // Helper functions for styling
    function getColorForNodeType(type: Node['type']): string {
        switch (type) {
            case 'focus': return 'var(--primary)';
            case 'derived': return 'var(--success)';
            case 'original': return 'var(--secondary)';
            case 'similar': return 'var(--warning)';
            default: return 'var(--bg-surface)';
        }
    }
    
    function getColorForLinkType(type: Link['type'] | string): string {
        switch (type) {
            case 'derives': return 'var(--primary)';
            case 'similar': return 'var(--warning)';
            case 'references': return 'var(--secondary)';
            default: return 'var(--text-secondary)';
        }
    }
    
    function truncateText(text: string, maxLength: number): string {
        return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
    }
    
    // Function to navigate to a constitution when clicked
    function navigateToConstitution(id: string) {
        // In a real implementation, this would navigate to the constitution detail page
        console.log(`Navigate to constitution: ${id}`);
    }
</script>

<div class="graph-container">
    {#if isLoading}
        <div class="loading-state">
            <div class="spinner"></div>
            <p>Loading relationship graph...</p>
        </div>
    {:else if error}
        <div class="error-state">
            <p>Error: {error}</p>
            <button class="retry-button" onclick={() => window.location.reload()}>Retry</button>
        </div>
    {:else}
        <div class="graph-header">
            <div class="legend">
                <div class="legend-item">
                    <span class="legend-color" style="background-color: var(--primary);"></span>
                    <span>Focus Constitution</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color" style="background-color: var(--success);"></span>
                    <span>Derived From</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color" style="background-color: var(--secondary);"></span>
                    <span>Original Source</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color" style="background-color: var(--warning);"></span>
                    <span>Similar</span>
                </div>
            </div>
            <div class="graph-controls">
                <button class="zoom-button" onclick={() => d3.select(svg).transition().call(d3.zoom().scaleTo as any, 1.2)}>
                    Zoom In
                </button>
                <button class="zoom-button" onclick={() => d3.select(svg).transition().call(d3.zoom().scaleTo as any, 0.8)}>
                    Zoom Out
                </button>
                <button class="reset-button" onclick={() => d3.select(svg).transition().call(d3.zoom().transform as any, d3.zoomIdentity)}>
                    Reset
                </button>
            </div>
        </div>
        <div class="graph-view">
            <svg bind:this={svg} width={width} height={height}></svg>
        </div>
    {/if}
</div>

<style lang="scss">
    @use '../styles/mixins' as *;

    .graph-container {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .loading-state, .error-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        
        .spinner {
            @include loading-spinner();
            margin-bottom: var(--space-md);
        }
        
        p {
            color: var(--text-secondary);
            margin-bottom: var(--space-md);
        }
        
        .retry-button {
            padding: 8px 16px;
            background-color: var(--primary);
            color: white;
            border: none;
            border-radius: var(--radius-md);
            cursor: pointer;
        }
    }

    .graph-header {
        display: flex;
        justify-content: space-between;
        padding: var(--space-sm);
        border-bottom: 1px solid var(--input-border);
    }

    .legend {
        display: flex;
        gap: var(--space-md);
    }

    .legend-item {
        display: flex;
        align-items: center;
        gap: var(--space-xs);
        font-size: 0.8rem;
    }

    .legend-color {
        width: 12px;
        height: 12px;
        border-radius: 50%;
    }

    .graph-controls {
        display: flex;
        gap: var(--space-xs);
    }

    .zoom-button, .reset-button {
        padding: 4px 8px;
        font-size: 0.8rem;
        background-color: var(--bg-elevated);
        border: 1px solid var(--input-border);
        border-radius: var(--radius-sm);
        cursor: pointer;
        
        &:hover {
            background-color: var(--bg-hover);
        }
    }

    .graph-view {
        flex: 1;
        overflow: hidden;
        
        svg {
            width: 100%;
            height: 100%;
            cursor: grab;
            
            &:active {
                cursor: grabbing;
            }
        }
    }
</style>