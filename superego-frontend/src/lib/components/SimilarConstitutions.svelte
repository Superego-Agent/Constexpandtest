<script lang="ts">
  import { constitutionStore } from '$lib/state/constitutions.svelte';
  // Add other imports as needed
  
  // Sample similar constitutions data
  let similarConstitutions = $state([
    {
      id: "sim-1",
      title: "Basic Safety Guidelines",
      similarity: 0.87,
      author: "AI Safety Institute",
      description: "Core principles for ensuring AI systems operate safely and ethically."
    },
    {
      id: "sim-2",
      title: "Creative Assistant Framework",
      similarity: 0.74,
      author: "Creative Commons",
      description: "Guidelines for AI systems that assist with creative tasks like writing and design."
    },
    {
      id: "sim-3",
      title: "Educational AI Constitution",
      similarity: 0.68,
      author: "Education First",
      description: "Framework for AI systems designed for educational environments."
    }
  ]);
  
  function viewConstitution(id: string) {
    console.log(`Viewing constitution with ID: ${id}`);
    // Navigate to constitution details
  }
</script>

<div class="similar-constitutions">
  <h2>Constitutions Similar to Yours</h2>
  
  <div class="similarity-intro">
    <p>Based on your constitutions, we've found these similar frameworks that might interest you:</p>
  </div>
  
  <div class="constitution-list">
    {#each similarConstitutions as constitution}
      <div class="constitution-card" onclick={() => viewConstitution(constitution.id)}>
        <div class="similarity-badge">{Math.round(constitution.similarity * 100)}% similar</div>
        <h3>{constitution.title}</h3>
        <div class="author">By: {constitution.author}</div>
        <p class="description">{constitution.description}</p>
      </div>
    {/each}
  </div>
</div>

<style lang="scss">
  .similar-constitutions {
    padding: var(--space-md);
    max-width: 1000px;
    margin: 0 auto;
  }
  
  h2 {
    font-size: 2rem;
    font-weight: 400;
    margin-bottom: var(--space-md);
    color: var(--text-primary);
  }
  
  .similarity-intro {
    margin-bottom: var(--space-lg);
    
    p {
      font-size: 1.1rem;
      color: var(--text-secondary);
    }
  }
  
  .constitution-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: var(--space-md);
  }
  
  .constitution-card {
    background-color: var(--bg-surface);
    border: 1px solid var(--card-border, var(--input-border));
    border-radius: var(--radius-md);
    padding: var(--space-md);
    cursor: pointer;
    position: relative;
    transition: all 0.2s ease;
    
    &:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-md);
    }
    
    h3 {
      margin-top: var(--space-sm);
      margin-bottom: var(--space-xs);
      font-size: 1.2rem;
      color: var(--text-primary);
    }
    
    .author {
      font-size: 0.9rem;
      color: var(--text-secondary);
      margin-bottom: var(--space-sm);
    }
    
    .description {
      font-size: 0.95rem;
      color: var(--text-secondary);
    }
    
    .similarity-badge {
      position: absolute;
      top: 10px;
      right: 10px;
      background-color: var(--primary);
      color: white;
      padding: 4px 8px;
      border-radius: var(--radius-pill);
      font-size: 0.8rem;
      font-weight: 500;
    }
  }
</style>