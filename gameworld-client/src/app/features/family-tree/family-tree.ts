import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface FamilyMember {
  id: string;
  name: string;
  generation: number; // 1 to 5
  parentId?: string;
}

@Component({
  selector: 'app-family-tree',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './family-tree.html',
  styleUrls: ['./family-tree.css']
})
export class FamilyTree {
  members: FamilyMember[] = [
    { id: 'root', name: '', generation: 1 } // The user (Generation 1)
  ];
  
  currentStage = 0;
  maxGenerationEntered = 1;

  getMembersByGen(gen: number) {
    return this.members.filter(m => m.generation === gen);
  }

  addParent(childId: string, gen: number) {
    if (gen > 5) return;
    
    // Add two parents
    this.members.push({ id: `p1-${childId}`, name: '', generation: gen, parentId: childId });
    this.members.push({ id: `p2-${childId}`, name: '', generation: gen, parentId: childId });
  }

  updateStage() {
    // Determine the maximum generation that has at least one name entered
    let maxGen = 1;
    for (const m of this.members) {
      if (m.name.trim() !== '' && m.generation > maxGen) {
        maxGen = m.generation;
      }
    }
    
    this.maxGenerationEntered = maxGen;

    // Stage logic
    if (this.maxGenerationEntered >= 5) this.currentStage = 4;
    else if (this.maxGenerationEntered >= 4) this.currentStage = 3;
    else if (this.maxGenerationEntered >= 3) this.currentStage = 2;
    else if (this.maxGenerationEntered >= 2) this.currentStage = 1;
    else this.currentStage = 0;
  }

  hasParents(childId: string): boolean {
    return this.members.some(m => m.parentId === childId);
  }

  getParents(childId: string): FamilyMember[] {
    return this.members.filter(m => m.parentId === childId);
  }
}
