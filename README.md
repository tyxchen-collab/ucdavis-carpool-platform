Davis Carpool Matching Platform

A web-based carpool coordination platform designed to help UC Davis students find compatible shared trips.

Status: In Development | Application: Phase 1 | Database: Phase 2.1 schema developed separately

Project Overview

Davis Carpool is a personal software development project focused on helping UC Davis students coordinate shared rides, such as trips between Davis and nearby airports.

The application provides a Chinese-language interface for searching trips, comparing departure times, and identifying compatible travel plans.

The current website uses mock data and does not support real bookings, user accounts, or persistent trip creation.

Tech Stack

Frontend: Next.js (App Router), TypeScript, Tailwind CSS

Database Design: PostgreSQL, Supabase

Testing: Node.js built-in test runner

Development Tools: Git, GitHub

Implemented Features

Trip Search and Matching

Search trips using origin, destination, departure date, time, and passenger capacity.

Normalize location names and support predefined Chinese, city, and airport aliases.

Compare departure-time windows using configurable flexibility.

Calculate compatibility scores from 0 to 100.

Exclude cancelled, past, full, invalid, and incompatible trips.

Display Chinese explanations for matching results.

Rank compatible trips deterministically.

Trip Creation Preview

Validate locations, dates, times, passenger counts, and field lengths.

Reject invalid or past departures using California local time.

Display a temporary preview of valid trip submissions.

Provide responsive pages for trip searching and details.

Trip submissions are not currently stored or published. Refreshing the page removes the preview.

Matching Algorithm

The matching system evaluates five criteria:

Criterion

Maximum Score

Origin compatibility

30

Destination compatibility

30

Departure date

20

Departure time

15

Available capacity

5

Total

100

The algorithm uses exact or predefined alias-based location matching, overlapping departure-time windows, and passenger-capacity constraints.

When search criteria are omitted, the score is normalized using only the specified criteria.

The system handles California local time, including daylight saving time transitions.

Matching scores indicate compatibility with the supplied criteria, not guaranteed transportation availability.

Database Design and Security

A separate PostgreSQL migration was developed for the next development phase using Supabase.

The schema defines three main tables:

profiles: Private user profile information.

trips: Trip details, ownership, departure times, capacity, and status.

trip_participants: Participation requests and their status.

The database design includes:

Row-Level Security (RLS) policies

Column-level permissions

UC Davis email eligibility checks

Ownership and identity protections

Database constraints and triggers

Restricted participation-request state transitions

Parent-row locking for selected concurrent operations

The SQL migration and supporting documentation are available in the supabase/ directory.

Important: The database schema is not yet connected to the Next.js application. Trip approval and seat reservation are not implemented. The schema should not be considered production-ready without the required database validation.

Testing

The matching algorithm includes automated tests covering:

Exact and alias-based location matching

Route and date compatibility

Departure-time flexibility

Passenger capacity

Unavailable trip exclusion

Invalid input handling

Deterministic ranking

California time and daylight saving transitions

Latest verified matching test results: 13 passed, 0 failed.

Run:

npm test

The repository also includes database security and concurrency testing documentation under supabase/.

These application tests do not establish database or RLS correctness.

Project Structure

src/
  app/                  Next.js pages and layouts
  components/           Search and trip display components
  lib/
    matching.ts         Rule-based matching algorithm
    trips.ts            Mock trip data and utilities

supabase/
  migrations/           PostgreSQL schema migration
  README.md             Database design and security documentation
  MANUAL_TESTING.md     Database validation checklist

tests/
  matching.test.mjs     Automated matching tests

Local Setup

Requires Node.js 22.18+ and npm.

git clone https://github.com/tyxchen-collab/ucdavis-carpool-platform.git
cd ucdavis-carpool-platform
npm ci
npm run dev

Open http://localhost:3000.

Additional commands:

npm test
npm run typecheck
npm run build

The current Phase 1 website does not require database credentials or environment variables.

Current Limitations

All trip listings are fictional demonstration data.

User authentication and UC Davis email verification are not integrated into the website.

Trip submissions are not saved to a database.

Joining trips and approving participation requests are disabled.

The dashboard is a placeholder.

The website has not been publicly deployed.

Future Development

Integrate Supabase authentication and PostgreSQL persistence.

Connect trip creation and search to database records.

Implement secure participation-request workflows.

Develop atomic capacity-controlled approval logic.

Complete database integration and concurrency testing.

Deploy and test the application.

Development Approach

AI-assisted coding tools were used to support implementation, debugging, and testing. Project functionality is reviewed and validated through local testing.

Disclaimer

This is an independent student project and is not affiliated with UC Davis.

The platform is intended to help students coordinate shared transportation. It does not operate transportation services, guarantee rides, or process payments.