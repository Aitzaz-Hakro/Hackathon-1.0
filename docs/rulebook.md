## Rule book Page 1
University Lab & Equipment Booking System

Problem-Solving Hackathon Project Draft

Core Domain: Laboratory booking, equipment reservation, approval workflows, conflict prevention, resource tracking

PROJECT TYPE

CORE DOMAIN

Real-world university resource management application

Laboratory booking, equipment reservation, approval workflows, conflict prevention, resource tracking

PLATFORM

FINAL OUTCOME

Web or Mobile Application

A deployed system that helps students, faculty, and lab staff reserve university labs and equipment, prevents booking conflicts, and provides usage analytics.


## Rule book Page 2
1. Project Overview & Real-World Problem

The University Lab & Equipment Booking System is designed to help universities manage laboratories, computers , projectors, electronics, In many universities research tools, cameras, networking devices, and other shared equipment.

, students and faculty still book labs or equipment manually through paper forms, WhatsApp messages, or direct requests

to lab staff. This can lead to:

Double bookings

Equipment being unavailable when needed

Confusion about who currently has an item

Delayed approvals

Missing or damaged equipment

Poor tracking of lab usage

The goal is to create one centralized platform where users can check availability, submit booking requests, receive approval, use the resource,

Difficulty identifying underused resources

and return it properly.

The complete flow should be:

User Request → Availability Check → Approval → Booking Confirmation → Resource Usage Return/Completion → Usage Record Updated

2. Main Users & Their Roles

Their Roles

Main Users

Users can

Browse available labs and equipment

Search by category

View available dates and time slots

Submit booking requests

Add booking purpose

Track approval status

Cancel bookings

View booking history

Student/Faculty Member

Lab staff can

Manage lab availability

Manage equipment

Approve or reject requests

Lab Staff/Lab Incharge

Department Coordinator

Issue equipment

Confirm returns

Record damage or missing items

Block resources temporarily

Update maintenance status

The coordinator can:

Review Important requests

Manage department labs

Define booking rules

Set priority levels

Monitor resource usage

Handie booking conflicts

The administrator can:

Manage users

Manage departments

Manage labs

View system-wide analytics

Manage equipment categories

Administrator

Monitor booking activity

Control permissions



## Rule book Page 3
3. Booking & Approval Workflow

Example:

"A student needs the Embedded Systems Lab and 5 Arduino kits for a project session on Friday from 2 PM to 4 PM.

The system should process the request in the following way:

1. User selects the required lab or equipment.

2. User chooses date and time.

3. System checks availability.

4. System checks booking rules.

5.

User submits the request.

6. Lab staff or coordinator reviews the request.

7. Request is approved or rejected.

8. If approved, the time slot and equipment are reserved.

9. User receives confirmation.

10. Resource is issued or lab access is granted.

11. After use, equipment is returned.

12. Booking is marked complete.

Possible booking statuses:

Draft Pending Approval Approved Reserved In Use → Completed

Other possible statuses:

Rejected

Cancelled

Overdue

Returned Late

Damaged
## Rule book Page 4
4. Smart Booking & Intelligent Features

The main intelligent feature can be Smart Resource Recommendation.

Instead of only showing exact matches, the system can suggest suitable alternatives based on:

Required equipment type

Quantity

Date and time

Lab capacity

User purpose

Department

Resource availability

Example:

Resource

Requested Time

Available

95%

30

Lab A

Capacity

Match

Not Available

40

Lab C

2-4 PM

No

2-4 PM

Yes

80%

20

Lab B

2-4 PM

Yes

Other intelligent features can include:

Conflict Detection: Detect overlapping bookings

Alternative Slot Recommendation: Suggest another time if the selected slot is unavailable

Usage Prediction: Predict which labs or equipment may be highly demanded

Maintenance Recommendation: Identify equipment frequently reported as faulty

Priority Recommendation: Help staff review urgent academic or research requests

5. Lab, Equipment & Availability Management

The system should manage laboratories and equipment separately.

Lab Information.

Possible lab details:

Lab ID

Lab name

Department

Capacity

Location

Available time slots

Facilities

Current status

Possible statuses:

Available/Reserved/In Use/Maintenance/Closed

Equipment Information

Possible equipment details:

Equipment ID

Name

Category

Quantity

Available quantity

Lab location

Condition

Maintenance status

Example:

Arduino Uno Kits

Total Quantity: 20

Reserved: 8

In Use: 5

Available: 7

The system should prevent users from booking more units than are available.


## Rule book Page 5
6. Conflict Detection, Issuing & Return Handling

Before confirming a booking, the system should check for conflicts.

Example:

Lab A

Existing Booking: 1:00 PM–3:00 PM

New Request: 2:00 PM-4:00 PM

Result:

Booking conflict detected.

The system can suggest:

3:00 PM–5:00 PM

Another available lab

Another date

For equipment issuing:

Requested Arduino Kits: 10

Available: 7

The system should either reject the request or suggest:

7 units are currently available.

The system should also track:

Issued date

Expected return date.

Actual return date

Returned condition

Damage report

Late return

7. Data Model & System Architecture

Lab Data

Possible fields:

lab id lab_name

department id

capacity

location

facilities

status

Equipment Data

Possible fields:

equipment id

equipment name

category

total quantity

available quantity

⚫condition

maintenance status

lab_id

Booking Data

Possible fields:

booking id

user id

resource type

⚫resource_id

booking date

start time

end_time

purpose

approval status

booking status

⚫ approved_by

Issue/Return Data

Possible fields.

Issue id

booking id

⚫equipment id

quantity

issued at

due at

returned at

⚫return_condition

remarks

Recommended system architecture:

Web/Mobile Application → Backend API → Booking Manager → Availability & Conflict Checker → Database → Approval / Notification Service

→Student/Faculty/Lab Staff

## Rule book Page 6
8. Search, Dashboard & Analytics

Users should be able to search and filter by:

Lab

Equipment

Department

Category

Date

Time

Availability

Booking status

The dashboard should provide useful statistics such as:

Total bookings

Approved bookings

Pending requests

Cancelled bookings

Equipment currently issued

Overdue equipment

Most-booked labs

Most-used equipment

Average lab utilization

Equipment damage reports.

The system can also show:

Usage by department

Peak booking hours

Resource usage by month

Underused labs

Frequently unavailable equipment

Booking rejection reasons

9. Notifications, Security & Rules

The system should send notifications when:

Booking is approved

Booking is rejected

Booking time is approaching

Equipment return date is approaching

Equipment is overdue

Resource becomes available

Booking is cancelled

The application should also include:

User authentication

Role-based access

Booking permissions

Input validation

Approval history

Resource activity history

Secure admin access

Universities should also be able to define rules such as:

Maximum booking duration

Maximum equipment quantity

Advance booking limit

Approval required for certain equipment

Department-specific access

Penalty or restriction after repeated late returns
## Rule book Page 7
10. Final Project Vision & Additional Features

The final system should demonstrate:

Search Resource →

Check Availability →

Submit Request

→ Approval →

Reservation→

Usage → Return →

Analytics Updated

The project should not become only a simple booking calendar.

It should combine:

Lab booking

Equipment reservation

Availability checking

Approval workflow

Conflict detection

Issue and return management

Maintenance status

Search and filtering

Dashboard and analytics

Notifications

Web/mobile deployment

Additional Features

Teams may also implement any of the following features to make their project more complete and demonstrate stronger technical

implementation during evaluation:

QR-based equipment checkout and return

Student ID card scanning

Live lab occupancy

Waitlist for fully booked labs

Equipment damage image upload

Automatic alternative lab suggestion

Maintenance scheduling

Faculty priority booking

Calendar integration

Email or push notifications

Equipment reservation through mobile app

Usage heatmap by lab or department

These features are not mandatory, but they can help teams demonstrate greater technical depth and a more complete solution during judging.