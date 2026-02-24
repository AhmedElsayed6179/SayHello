import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import Swal from 'sweetalert2';
import { environment } from '../../environments/environment.development';

@Component({
  selector: 'app-home',
  imports: [TranslatePipe, CommonModule, ReactiveFormsModule],
  templateUrl: './home.html',
  styleUrls: ['./home.scss'],
})
export class Home {
  usernameForm: FormGroup;
  sections: any[] = [];

  constructor(private router: Router, private translate: TranslateService) {
    this.usernameForm = new FormGroup({
      username: new FormControl<string>('', {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(20),
          Validators.pattern(/^[a-zA-Z\u0600-\u06FF]+( [a-zA-Z\u0600-\u06FF]+)*$/)
        ]
      })
    });
    this.sections = [
      {
        icon: 'fas fa-comments',
        title: 'SECTIONS.ONE.TITLE',
        desc: 'SECTIONS.ONE.DESC',
        details: [
          'SECTIONS.ONE.DETAIL1',
          'SECTIONS.ONE.DETAIL2',
          'SECTIONS.ONE.DETAIL3'
        ]
      },
      {
        icon: 'fas fa-users',
        title: 'SECTIONS.TWO.TITLE',
        desc: 'SECTIONS.TWO.DESC',
        details: [
          'SECTIONS.TWO.DETAIL1',
          'SECTIONS.TWO.DETAIL2',
          'SECTIONS.TWO.DETAIL3'
        ]
      },
      {
        icon: 'fas fa-shield-alt',
        title: 'SECTIONS.THREE.TITLE',
        desc: 'SECTIONS.THREE.DESC',
        details: [
          'SECTIONS.THREE.DETAIL1',
          'SECTIONS.THREE.DETAIL2',
          'SECTIONS.THREE.DETAIL3'
        ]
      }
    ];
  }

  get currentDir() {
    return this.translate.currentLang === 'ar' ? 'rtl' : 'ltr';
  }

  startChat() {
    if (this.usernameForm.invalid) {
      const errors = this.usernameForm.controls['username'].errors;
      let message = '';
      if (errors?.['required']) message = this.translate.instant('HOME.ERROR_REQUIRED');
      else if (errors?.['minlength']) message = this.translate.instant('HOME.ERROR_MINLENGTH');
      else if (errors?.['maxlength']) message = this.translate.instant('HOME.ERROR_MAXLENGTH');
      else if (errors?.['pattern']) message = this.translate.instant('HOME.ERROR_PATTERN');

      Swal.fire({
        icon: 'error',
        title: this.translate.instant('HOME.ERROR_TITLE'),
        text: message,
        confirmButtonText: this.translate.instant('HOME.ERROR_OK')
      });
      return;
    }

    const name = this.usernameForm.value.username.trim();
    if (!name) return;

    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const uniqueName = `${name}-${randomSuffix}`;

    fetch(`${environment.SayHello_Server}/start-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: uniqueName })
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to start chat');
        return res.json();
      })
      .then(data => {
        const token = data.token;
        this.router.navigate(['/chat'], {
          queryParams: { token },
          state: { name: uniqueName }
        });
      })
      .catch(err => {
        console.error(err);
        Swal.fire({
          icon: 'error',
          title: this.translate.instant('HOME.ERROR_INTERNET'),
          text: this.translate.instant('HOME.ERROR_SERVER'),
          confirmButtonText: this.translate.instant('HOME.ERROR_OK')
        });
      });
  }

  get isDarkMode(): boolean { return document.body.classList.contains('dark-mode'); }
}


