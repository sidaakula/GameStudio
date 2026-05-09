import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './home.html',
  styleUrls: ['./home.css']
})
export class Home implements OnInit {
  robotScores: any[] = [];
  quizScores: any[] = [];

  ngOnInit() {
    this.fetchLeaderboards();
  }

  async fetchLeaderboards() {
    try {
      const robotRes = await fetch('/api/leaderboard/CatchTheRobots');
      if (robotRes.ok) this.robotScores = await robotRes.json();
      
      const quizRes = await fetch('/api/leaderboard/RoadSafetyQuiz');
      if (quizRes.ok) this.quizScores = await quizRes.json();
    } catch (err) {
      console.error('Failed to fetch leaderboards', err);
    }
  }
}
