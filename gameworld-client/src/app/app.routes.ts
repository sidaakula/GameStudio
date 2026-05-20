import { Routes } from '@angular/router';
import { RobotGame } from './features/robot-game/robot-game';
import { FamilyTree } from './features/family-tree/family-tree';
import { RoadSafetyQuiz } from './features/road-safety-quiz/road-safety-quiz';
import { MainframeOverride } from './features/mainframe-override/mainframe-override';
import { Trivia } from './features/trivia/trivia';
import { Home } from './features/home/home';

export const routes: Routes = [
  { path: 'home', component: Home },
  { path: 'robot-game', component: RobotGame },
  { path: 'family-tree', component: FamilyTree },
  { path: 'road-safety-quiz', component: RoadSafetyQuiz },
  { path: 'mainframe-override', component: MainframeOverride },
  { path: 'trivia', component: Trivia },
  { path: '', redirectTo: '/home', pathMatch: 'full' }
];
