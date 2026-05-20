import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private readonly USERNAME_KEY = 'gameworld_username';

  constructor() { }

  setUsername(name: string): void {
    if (name && name.trim().length > 0) {
      localStorage.setItem(this.USERNAME_KEY, name.trim());
    }
  }

  getUsername(): string | null {
    return localStorage.getItem(this.USERNAME_KEY);
  }

  isLoggedIn(): boolean {
    const name = this.getUsername();
    return name !== null && name.trim().length > 0;
  }
  
  logout(): void {
    localStorage.removeItem(this.USERNAME_KEY);
  }
}
