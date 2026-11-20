#!/usr/bin/env node
import { hashPassword } from '../src/auth/passwords.js';
console.log(await hashPassword(process.argv[2] || 'password123'));
