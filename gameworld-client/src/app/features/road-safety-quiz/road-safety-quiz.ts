import { Component } from '@angular/core';
import { UserService } from '../../shared/user.service';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

interface Question {
  text: string;
  options: string[];
  correctIndex: number;
}

@Component({
  selector: 'app-road-safety-quiz',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './road-safety-quiz.html',
  styleUrls: ['./road-safety-quiz.css']
})
export class RoadSafetyQuiz {
  questions: Question[] = [
    { text: "What does a solid red traffic light mean?", options: ["Go", "Yield", "Stop", "Caution"], correctIndex: 2 },
    { text: "Who has the right of way at a crosswalk?", options: ["Cars", "Pedestrians", "Bicycles", "Motorcycles"], correctIndex: 1 },
    { text: "What shape is a standard STOP sign?", options: ["Circle", "Square", "Triangle", "Octagon"], correctIndex: 3 },
    { text: "When riding a bicycle at night, you must have:", options: ["A bell", "A front light and rear reflector", "A basket", "Loud music"], correctIndex: 1 },
    { text: "Before crossing the street, you should look:", options: ["Left, Right, Left", "Straight ahead", "Down at your phone", "Up at the sky"], correctIndex: 0 },
    { text: "What does a yellow traffic light mean?", options: ["Speed up", "Prepare to stop", "Stop immediately", "Go"], correctIndex: 1 },
    { text: "Where is the safest place to cross a busy street?", options: ["Between parked cars", "At a designated crosswalk", "In the middle of the block", "On a curve"], correctIndex: 1 },
    { text: "If you are walking where there is no sidewalk, you should walk:", options: ["In the middle of the road", "Facing traffic", "With traffic", "In the bike lane"], correctIndex: 1 },
    { text: "When getting out of a car on the street side, you should:", options: ["Open the door quickly", "Look for approaching traffic/bikes", "Exit immediately", "Leave the door open"], correctIndex: 1 },
    { text: "What is the purpose of a seatbelt?", options: ["Decoration", "Keep you comfortable", "Protect you in a collision", "Hold your drinks"], correctIndex: 2 }
  ];

  currentQuestionIndex = 0;
  score = 0;
  gameState: 'start' | 'playing' | 'gameover' = 'start';
  selectedOptionIndex: number | null = null;
  showAnswer = false;

  constructor(private userService: UserService) {}

  startGame() {
    this.gameState = 'playing';
    this.score = 0;
    this.currentQuestionIndex = 0;
    this.resetSelection();
  }

  selectOption(index: number) {
    if (this.showAnswer) return;
    this.selectedOptionIndex = index;
    this.showAnswer = true;
    
    if (index === this.questions[this.currentQuestionIndex].correctIndex) {
      this.score += 10;
    }

    setTimeout(() => {
      this.nextQuestion();
    }, 1500); // Wait 1.5 seconds before moving on
  }

  nextQuestion() {
    this.currentQuestionIndex++;
    this.resetSelection();
    
    if (this.currentQuestionIndex >= this.questions.length) {
      this.gameState = 'gameover';
      this.submitScore();
    }
  }

  resetSelection() {
    this.selectedOptionIndex = null;
    this.showAnswer = false;
  }

  async submitScore() {
    const playerName = this.userService.getUsername();
    if (!playerName) return;
    
    try {
      await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameName: 'RoadSafetyQuiz',
          playerName: playerName,
          score: this.score
        })
      });
      // Automatically return to start screen after short delay, or let user click play again
    } catch (err) {
      console.error('Failed to submit score', err);
    }
  }
}
