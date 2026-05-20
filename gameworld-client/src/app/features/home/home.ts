import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { UserService } from '../../shared/user.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './home.html',
  styleUrls: ['./home.css']
})
export class Home implements OnInit {
  commonScores: any[] = [];
  robotScores: any[] = [];
  quizScores: any[] = [];
  treeScores: any[] = [];
  mainframeScores: any[] = [];
  triviaScores: any[] = [];

  usernameInput: string = '';

  constructor(public userService: UserService, private cdr: ChangeDetectorRef) {}

  getCurrentUsername(): string {
    return this.userService.getUsername() || '';
  }

  ngOnInit() {
    this.fetchLeaderboards();
  }

  login() {
    if (this.usernameInput.trim().length > 0) {
      this.userService.setUsername(this.usernameInput);
      this.fetchLeaderboards(); // Fetch immediately for the logged-in user
    }
  }

  logout() {
    this.userService.logout();
    this.usernameInput = '';
    this.cdr.detectChanges();
  }

  async fetchLeaderboards() {
    try {
      const fetchJson = async (url: string) => {
        const res = await fetch(`${url}?t=${Date.now()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        return res.json();
      };

      const results = await Promise.allSettled([
        fetchJson('/api/leaderboard/common'),
        fetchJson('/api/leaderboard/CatchTheRobots'),
        fetchJson('/api/leaderboard/RoadSafetyQuiz'),
        fetchJson('/api/leaderboard/FamilyTreeQuest'),
        fetchJson('/api/leaderboard/MainframeOverride'),
        fetchJson('/api/leaderboard/TriviaAI')
      ]);

      if (results[0].status === 'fulfilled') this.commonScores = results[0].value;
      if (results[1].status === 'fulfilled') this.robotScores = results[1].value;
      if (results[2].status === 'fulfilled') this.quizScores = results[2].value;
      if (results[3].status === 'fulfilled') this.treeScores = results[3].value;
      if (results[4].status === 'fulfilled') this.mainframeScores = results[4].value;
      if (results[5].status === 'fulfilled') this.triviaScores = results[5].value;

      // Log any failures for debugging
      results.forEach((res, index) => {
        if (res.status === 'rejected') {
          console.warn(`Leaderboard fetch at index ${index} failed:`, res.reason);
        }
      });
    } catch (err) {
      console.error('Unexpected error fetching leaderboards', err);
    } finally {
      this.cdr.detectChanges();
    }
  }
}
