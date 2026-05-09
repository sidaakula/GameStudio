import { Routes } from '@angular/router';
import { RobotGame } from './features/robot-game/robot-game';
import { FamilyTree } from './features/family-tree/family-tree';
import { RoadSafetyQuiz } from './features/road-safety-quiz/road-safety-quiz';
import { Home } from './features/home/home';

export const routes: Routes = [
  { path: 'home', component: Home },
  { path: 'robot-game', component: RobotGame },
  { path: 'family-tree', component: FamilyTree },
  { path: 'road-safety-quiz', component: RoadSafetyQuiz },
  { path: '', redirectTo: '/home', pathMatch: 'full' }
];
