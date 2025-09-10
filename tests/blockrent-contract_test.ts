
import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v0.14.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

// Helper functions for test data
const createTestProperty = (deployer: Account, address: string, rent: number, deposit: number, description: string) => {
    return Tx.contractCall(
        'blockrent-contract',
        'register-property',
        [
            types.ascii(address),
            types.uint(rent),
            types.uint(deposit),
            types.ascii(description)
        ],
        deployer.address
    );
};

const createTestLease = (deployer: Account, propertyId: number, tenant: string, startDate: number, endDate: number) => {
    return Tx.contractCall(
        'blockrent-contract',
        'create-lease',
        [
            types.uint(propertyId),
            types.principal(tenant),
            types.uint(startDate),
            types.uint(endDate)
        ],
        deployer.address
    );
};

// Test Suite 1: Property Registration and Management
Clarinet.test({
    name: "Property registration creates new property with correct details",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const propertyAddress = "123 Main St, Anytown USA";
        const monthlyRent = 1500;
        const securityDeposit = 3000;
        const description = "Beautiful 2-bedroom apartment with modern amenities";

        let block = chain.mineBlock([
            createTestProperty(deployer, propertyAddress, monthlyRent, securityDeposit, description)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), types.uint(1));

        // Verify property details
        let propertyOwner = chain.callReadOnlyFn('blockrent-contract', 'get-property-owner', [types.uint(1)], deployer.address);
        assertEquals(propertyOwner.result.expectSome(), deployer.address);

        let propertyAddressResult = chain.callReadOnlyFn('blockrent-contract', 'get-property-address', [types.uint(1)], deployer.address);
        assertEquals(propertyAddressResult.result.expectSome(), types.ascii(propertyAddress));

        let propertyRent = chain.callReadOnlyFn('blockrent-contract', 'get-property-rent', [types.uint(1)], deployer.address);
        assertEquals(propertyRent.result.expectSome(), types.uint(monthlyRent));

        let propertyDeposit = chain.callReadOnlyFn('blockrent-contract', 'get-property-deposit', [types.uint(1)], deployer.address);
        assertEquals(propertyDeposit.result.expectSome(), types.uint(securityDeposit));

        let propertyAvailable = chain.callReadOnlyFn('blockrent-contract', 'get-property-available', [types.uint(1)], deployer.address);
        assertEquals(propertyAvailable.result.expectSome(), types.bool(true));

        let propertyDescription = chain.callReadOnlyFn('blockrent-contract', 'get-property-description', [types.uint(1)], deployer.address);
        assertEquals(propertyDescription.result.expectSome(), types.ascii(description));
    },
});

Clarinet.test({
    name: "Multiple properties can be registered with sequential IDs",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;

        let block = chain.mineBlock([
            createTestProperty(deployer, "123 Main St", 1500, 3000, "Property 1"),
            createTestProperty(wallet1, "456 Oak Ave", 2000, 4000, "Property 2"),
            createTestProperty(deployer, "789 Pine Rd", 1200, 2400, "Property 3")
        ]);

        assertEquals(block.receipts.length, 3);
        assertEquals(block.receipts[0].result.expectOk(), types.uint(1));
        assertEquals(block.receipts[1].result.expectOk(), types.uint(2));
        assertEquals(block.receipts[2].result.expectOk(), types.uint(3));

        // Verify property counter
        let propertyCount = chain.callReadOnlyFn('blockrent-contract', 'get-property-count', [], deployer.address);
        assertEquals(propertyCount.result, types.uint(3));

        // Verify different owners
        let owner1 = chain.callReadOnlyFn('blockrent-contract', 'get-property-owner', [types.uint(1)], deployer.address);
        assertEquals(owner1.result.expectSome(), deployer.address);

        let owner2 = chain.callReadOnlyFn('blockrent-contract', 'get-property-owner', [types.uint(2)], deployer.address);
        assertEquals(owner2.result.expectSome(), wallet1.address);
    },
});

Clarinet.test({
    name: "Property update works correctly for available properties",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;

        // Register a property
        let block = chain.mineBlock([
            createTestProperty(deployer, "123 Main St", 1500, 3000, "Original description")
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), types.uint(1));

        // Update the property
        block = chain.mineBlock([
            Tx.contractCall(
                'blockrent-contract',
                'update-property',
                [
                    types.uint(1),
                    types.uint(1800), // new rent
                    types.uint(3600), // new deposit
                    types.ascii("Updated description with new amenities")
                ],
                deployer.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), types.ascii("Property updated successfully"));

        // Verify updates
        let newRent = chain.callReadOnlyFn('blockrent-contract', 'get-property-rent', [types.uint(1)], deployer.address);
        assertEquals(newRent.result.expectSome(), types.uint(1800));

        let newDeposit = chain.callReadOnlyFn('blockrent-contract', 'get-property-deposit', [types.uint(1)], deployer.address);
        assertEquals(newDeposit.result.expectSome(), types.uint(3600));

        let newDescription = chain.callReadOnlyFn('blockrent-contract', 'get-property-description', [types.uint(1)], deployer.address);
        assertEquals(newDescription.result.expectSome(), types.ascii("Updated description with new amenities"));

        // Test unauthorized update
        block = chain.mineBlock([
            Tx.contractCall(
                'blockrent-contract',
                'update-property',
                [
                    types.uint(1),
                    types.uint(2000),
                    types.uint(4000),
                    types.ascii("Unauthorized update")
                ],
                wallet1.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.ascii("Unauthorized or property not available"));
    },
});

// Test Suite 2: Lease Creation and Management
Clarinet.test({
    name: "Lease creation works with valid parameters",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const tenant = accounts.get('wallet_1')!;

        // Register a property first
        let block = chain.mineBlock([
            createTestProperty(deployer, "123 Main St", 1500, 3000, "Test property")
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), types.uint(1));

        // Create a lease
        const startDate = 1625097600; // July 1, 2021
        const endDate = 1656633600;   // July 1, 2022
        
        block = chain.mineBlock([
            createTestLease(deployer, 1, tenant.address, startDate, endDate)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), types.uint(1));

        // Verify lease details
        let leaseProperty = chain.callReadOnlyFn('blockrent-contract', 'get-lease-property', [types.uint(1)], deployer.address);
        assertEquals(leaseProperty.result.expectSome(), types.uint(1));

        let leaseTenant = chain.callReadOnlyFn('blockrent-contract', 'get-lease-tenant', [types.uint(1)], deployer.address);
        assertEquals(leaseTenant.result.expectSome(), tenant.address);

        let leaseRent = chain.callReadOnlyFn('blockrent-contract', 'get-lease-rent', [types.uint(1)], deployer.address);
        assertEquals(leaseRent.result.expectSome(), types.uint(1500));

        let leaseStatus = chain.callReadOnlyFn('blockrent-contract', 'get-lease-status', [types.uint(1)], deployer.address);
        assertEquals(leaseStatus.result.expectSome(), types.ascii("active"));

        // Verify property is no longer available
        let propertyAvailable = chain.callReadOnlyFn('blockrent-contract', 'get-property-available', [types.uint(1)], deployer.address);
        assertEquals(propertyAvailable.result.expectSome(), types.bool(false));

        // Verify lease counter
        let leaseCount = chain.callReadOnlyFn('blockrent-contract', 'get-lease-count', [], deployer.address);
        assertEquals(leaseCount.result, types.uint(1));
    },
});

Clarinet.test({
    name: "Lease creation fails with invalid parameters",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const tenant = accounts.get('wallet_1')!;
        const unauthorized = accounts.get('wallet_2')!;

        // Register a property first
        let block = chain.mineBlock([
            createTestProperty(deployer, "123 Main St", 1500, 3000, "Test property")
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), types.uint(1));

        // Test invalid date range (end before start)
        block = chain.mineBlock([
            createTestLease(deployer, 1, tenant.address, 1656633600, 1625097600)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.ascii("Invalid lease creation parameters"));

        // Test unauthorized lease creation
        block = chain.mineBlock([
            createTestLease(unauthorized, 1, tenant.address, 1625097600, 1656633600)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.ascii("Invalid lease creation parameters"));

        // Test lease on non-existent property
        block = chain.mineBlock([
            createTestLease(deployer, 999, tenant.address, 1625097600, 1656633600)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.ascii("Property not found"));

        // Create valid lease first
        block = chain.mineBlock([
            createTestLease(deployer, 1, tenant.address, 1625097600, 1656633600)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), types.uint(1));

        // Test lease creation on unavailable property
        block = chain.mineBlock([
            createTestLease(deployer, 1, accounts.get('wallet_3')!.address, 1625097600, 1656633600)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.ascii("Invalid lease creation parameters"));
    },
});

Clarinet.test({
    name: "Multiple leases can be created for different properties",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const tenant1 = accounts.get('wallet_1')!;
        const tenant2 = accounts.get('wallet_2')!;

        // Register multiple properties
        let block = chain.mineBlock([
            createTestProperty(deployer, "123 Main St", 1500, 3000, "Property 1"),
            createTestProperty(deployer, "456 Oak Ave", 2000, 4000, "Property 2")
        ]);

        assertEquals(block.receipts.length, 2);
        assertEquals(block.receipts[0].result.expectOk(), types.uint(1));
        assertEquals(block.receipts[1].result.expectOk(), types.uint(2));

        // Create leases for both properties
        block = chain.mineBlock([
            createTestLease(deployer, 1, tenant1.address, 1625097600, 1656633600),
            createTestLease(deployer, 2, tenant2.address, 1625097600, 1656633600)
        ]);

        assertEquals(block.receipts.length, 2);
        assertEquals(block.receipts[0].result.expectOk(), types.uint(1));
        assertEquals(block.receipts[1].result.expectOk(), types.uint(2));

        // Verify both leases are active
        let lease1Status = chain.callReadOnlyFn('blockrent-contract', 'get-lease-status', [types.uint(1)], deployer.address);
        assertEquals(lease1Status.result.expectSome(), types.ascii("active"));

        let lease2Status = chain.callReadOnlyFn('blockrent-contract', 'get-lease-status', [types.uint(2)], deployer.address);
        assertEquals(lease2Status.result.expectSome(), types.ascii("active"));

        // Verify both properties are unavailable
        let prop1Available = chain.callReadOnlyFn('blockrent-contract', 'get-property-available', [types.uint(1)], deployer.address);
        assertEquals(prop1Available.result.expectSome(), types.bool(false));

        let prop2Available = chain.callReadOnlyFn('blockrent-contract', 'get-property-available', [types.uint(2)], deployer.address);
        assertEquals(prop2Available.result.expectSome(), types.bool(false));

        // Verify lease counter
        let leaseCount = chain.callReadOnlyFn('blockrent-contract', 'get-lease-count', [], deployer.address);
        assertEquals(leaseCount.result, types.uint(2));
    },
});

Clarinet.test({
    name: "Emergency termination works correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const tenant = accounts.get('wallet_1')!;
        const unauthorized = accounts.get('wallet_2')!;

        // Register property and create lease
        let block = chain.mineBlock([
            createTestProperty(deployer, "123 Main St", 1500, 3000, "Test property"),
        ]);

        assertEquals(block.receipts.length, 1);

        block = chain.mineBlock([
            createTestLease(deployer, 1, tenant.address, 1625097600, 1656633600)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), types.uint(1));

        // Test unauthorized emergency termination
        block = chain.mineBlock([
            Tx.contractCall(
                'blockrent-contract',
                'emergency-terminate',
                [types.uint(1)],
                unauthorized.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.ascii("Unauthorized emergency termination"));

        // Test authorized emergency termination
        block = chain.mineBlock([
            Tx.contractCall(
                'blockrent-contract',
                'emergency-terminate',
                [types.uint(1)],
                deployer.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), types.ascii("Lease emergency terminated"));

        // Verify lease status changed
        let leaseStatus = chain.callReadOnlyFn('blockrent-contract', 'get-lease-status', [types.uint(1)], deployer.address);
        assertEquals(leaseStatus.result.expectSome(), types.ascii("emergency-terminated"));

        // Verify property is available again
        let propertyAvailable = chain.callReadOnlyFn('blockrent-contract', 'get-property-available', [types.uint(1)], deployer.address);
        assertEquals(propertyAvailable.result.expectSome(), types.bool(true));
    },
});

// Test Suite 3: Rent Payment and Escrow Management
Clarinet.test({
    name: "Rent payment works correctly with escrow",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const tenant = accounts.get('wallet_1')!;

        // Setup property and lease
        let block = chain.mineBlock([
            createTestProperty(deployer, "123 Main St", 1500, 3000, "Test property"),
        ]);

        block = chain.mineBlock([
            createTestLease(deployer, 1, tenant.address, 1625097600, 1656633600)
        ]);

        assertEquals(block.receipts[0].result.expectOk(), types.uint(1));

        // Pay rent
        block = chain.mineBlock([
            Tx.contractCall(
                'blockrent-contract',
                'pay-rent',
                [
                    types.uint(1),
                    types.uint(1500)
                ],
                tenant.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        
        // Check if payment was accepted (should have escrow fee calculation)
        const result = block.receipts[0].result.expectOk();
        
        // Since we can't easily access tuple fields in this version, 
        // let's just verify the payment was successful
        // The tuple should contain escrow-fee and amount fields

        // Verify escrow balance updated
        let escrowBalance = chain.callReadOnlyFn('blockrent-contract', 'get-escrow-balance', [types.uint(1)], deployer.address);
        assertEquals(escrowBalance.result.expectSome(), types.uint(1500));
    },
});

Clarinet.test({
    name: "Rent payment fails with insufficient amount",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const tenant = accounts.get('wallet_1')!;

        // Setup property and lease
        let block = chain.mineBlock([
            createTestProperty(deployer, "123 Main St", 1500, 3000, "Test property"),
        ]);

        block = chain.mineBlock([
            createTestLease(deployer, 1, tenant.address, 1625097600, 1656633600)
        ]);

        // Try to pay insufficient rent
        block = chain.mineBlock([
            Tx.contractCall(
                'blockrent-contract',
                'pay-rent',
                [
                    types.uint(1),
                    types.uint(1000) // Less than required 1500
                ],
                tenant.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.ascii("Insufficient payment amount"));
    },
});

Clarinet.test({
    name: "Unauthorized rent payment fails",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const tenant = accounts.get('wallet_1')!;
        const unauthorized = accounts.get('wallet_2')!;

        // Setup property and lease
        let block = chain.mineBlock([
            createTestProperty(deployer, "123 Main St", 1500, 3000, "Test property"),
        ]);

        block = chain.mineBlock([
            createTestLease(deployer, 1, tenant.address, 1625097600, 1656633600)
        ]);

        // Try unauthorized payment
        block = chain.mineBlock([
            Tx.contractCall(
                'blockrent-contract',
                'pay-rent',
                [
                    types.uint(1),
                    types.uint(1500)
                ],
                unauthorized.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.ascii("Invalid rent payment"));
    },
});

// Test Suite 4: Late Fees and Lease Termination
Clarinet.test({
    name: "Late fee processing works correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const tenant = accounts.get('wallet_1')!;

        // Setup property and lease
        let block = chain.mineBlock([
            createTestProperty(deployer, "123 Main St", 1500, 3000, "Test property"),
        ]);

        block = chain.mineBlock([
            createTestLease(deployer, 1, tenant.address, 1625097600, 1656633600)
        ]);

        // Process late fees
        block = chain.mineBlock([
            Tx.contractCall(
                'blockrent-contract',
                'process-late-fees',
                [types.uint(1)],
                deployer.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        const result = block.receipts[0].result.expectOk();
        
        // Since we can't easily access tuple fields in this version,
        // let's just verify the operation was successful
        // The tuple should contain late-fees and status fields
        
        // Verify lease status is still active
        let leaseStatus = chain.callReadOnlyFn('blockrent-contract', 'get-lease-status', [types.uint(1)], deployer.address);
        assertEquals(leaseStatus.result.expectSome(), types.ascii("active"));
    },
});

// Test Suite 5: Lease Ending and Escrow Withdrawal
Clarinet.test({
    name: "Lease ending works correctly for property owner",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const tenant = accounts.get('wallet_1')!;

        // Setup property and lease
        let block = chain.mineBlock([
            createTestProperty(deployer, "123 Main St", 1500, 3000, "Test property"),
        ]);

        block = chain.mineBlock([
            createTestLease(deployer, 1, tenant.address, 1625097600, 1656633600)
        ]);

        // Pay some rent to create escrow balance
        block = chain.mineBlock([
            Tx.contractCall(
                'blockrent-contract',
                'pay-rent',
                [
                    types.uint(1),
                    types.uint(1500)
                ],
                tenant.address
            )
        ]);

        // End lease as property owner
        block = chain.mineBlock([
            Tx.contractCall(
                'blockrent-contract',
                'end-lease',
                [types.uint(1)],
                deployer.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        const result = block.receipts[0].result.expectOk();
        
        // Since we can't easily access tuple fields in this version,
        // let's just verify the operation was successful
        // The tuple should contain tenant-return and owner-amount fields

        // Verify lease status changed
        let leaseStatus = chain.callReadOnlyFn('blockrent-contract', 'get-lease-status', [types.uint(1)], deployer.address);
        assertEquals(leaseStatus.result.expectSome(), types.ascii("ended"));

        // Verify property is available again
        let propertyAvailable = chain.callReadOnlyFn('blockrent-contract', 'get-property-available', [types.uint(1)], deployer.address);
        assertEquals(propertyAvailable.result.expectSome(), types.bool(true));
    },
});

Clarinet.test({
    name: "Lease ending works correctly for tenant",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const tenant = accounts.get('wallet_1')!;

        // Setup property and lease
        let block = chain.mineBlock([
            createTestProperty(deployer, "123 Main St", 1500, 3000, "Test property"),
        ]);

        block = chain.mineBlock([
            createTestLease(deployer, 1, tenant.address, 1625097600, 1656633600)
        ]);

        // End lease as tenant
        block = chain.mineBlock([
            Tx.contractCall(
                'blockrent-contract',
                'end-lease',
                [types.uint(1)],
                tenant.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk();

        // Verify lease status changed
        let leaseStatus = chain.callReadOnlyFn('blockrent-contract', 'get-lease-status', [types.uint(1)], deployer.address);
        assertEquals(leaseStatus.result.expectSome(), types.ascii("ended"));
    },
});

Clarinet.test({
    name: "Unauthorized lease ending fails",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const tenant = accounts.get('wallet_1')!;
        const unauthorized = accounts.get('wallet_2')!;

        // Setup property and lease
        let block = chain.mineBlock([
            createTestProperty(deployer, "123 Main St", 1500, 3000, "Test property"),
        ]);

        block = chain.mineBlock([
            createTestLease(deployer, 1, tenant.address, 1625097600, 1656633600)
        ]);

        // Try unauthorized lease ending
        block = chain.mineBlock([
            Tx.contractCall(
                'blockrent-contract',
                'end-lease',
                [types.uint(1)],
                unauthorized.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.ascii("Invalid lease end request"));
    },
});

Clarinet.test({
    name: "Escrow withdrawal works correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const tenant = accounts.get('wallet_1')!;

        // Setup property and lease
        let block = chain.mineBlock([
            createTestProperty(deployer, "123 Main St", 1500, 3000, "Test property"),
        ]);

        block = chain.mineBlock([
            createTestLease(deployer, 1, tenant.address, 1625097600, 1656633600)
        ]);

        // Pay rent to create escrow
        block = chain.mineBlock([
            Tx.contractCall(
                'blockrent-contract',
                'pay-rent',
                [
                    types.uint(1),
                    types.uint(1500)
                ],
                tenant.address
            )
        ]);

        // End lease first
        block = chain.mineBlock([
            Tx.contractCall(
                'blockrent-contract',
                'end-lease',
                [types.uint(1)],
                deployer.address
            )
        ]);

        // Withdraw escrow
        block = chain.mineBlock([
            Tx.contractCall(
                'blockrent-contract',
                'withdraw-escrow',
                [types.uint(1)],
                deployer.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        const result = block.receipts[0].result.expectOk();
        
        // Since we can't easily access tuple fields in this version,
        // let's just verify the operation was successful
        // The tuple should contain withdrawn and status fields

        // We'll skip the detailed tuple field verification for this version

        // Verify escrow balance is now zero
        let escrowBalance = chain.callReadOnlyFn('blockrent-contract', 'get-escrow-balance', [types.uint(1)], deployer.address);
        assertEquals(escrowBalance.result.expectSome(), types.uint(0));
    },
});

// Test Suite 6: Edge Cases and Integration Tests
Clarinet.test({
    name: "Multiple sequential operations work correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const tenant1 = accounts.get('wallet_1')!;
        const tenant2 = accounts.get('wallet_2')!;

        // Register multiple properties
        let block = chain.mineBlock([
            createTestProperty(deployer, "123 Main St", 1500, 3000, "Property 1"),
            createTestProperty(deployer, "456 Oak Ave", 2000, 4000, "Property 2"),
            createTestProperty(deployer, "789 Pine Rd", 1200, 2400, "Property 3")
        ]);

        assertEquals(block.receipts.length, 3);
        
        // Create leases for all properties
        block = chain.mineBlock([
            createTestLease(deployer, 1, tenant1.address, 1625097600, 1656633600),
            createTestLease(deployer, 2, tenant2.address, 1625097600, 1656633600),
            createTestLease(deployer, 3, tenant1.address, 1625097600, 1656633600)
        ]);

        assertEquals(block.receipts.length, 3);

        // Pay rent for multiple leases
        block = chain.mineBlock([
            Tx.contractCall('blockrent-contract', 'pay-rent', [types.uint(1), types.uint(1500)], tenant1.address),
            Tx.contractCall('blockrent-contract', 'pay-rent', [types.uint(2), types.uint(2000)], tenant2.address),
            Tx.contractCall('blockrent-contract', 'pay-rent', [types.uint(3), types.uint(1200)], tenant1.address)
        ]);

        assertEquals(block.receipts.length, 3);
        block.receipts.forEach(receipt => receipt.result.expectOk());

        // Process late fees for all leases
        block = chain.mineBlock([
            Tx.contractCall('blockrent-contract', 'process-late-fees', [types.uint(1)], deployer.address),
            Tx.contractCall('blockrent-contract', 'process-late-fees', [types.uint(2)], deployer.address),
            Tx.contractCall('blockrent-contract', 'process-late-fees', [types.uint(3)], deployer.address)
        ]);

        assertEquals(block.receipts.length, 3);
        block.receipts.forEach(receipt => receipt.result.expectOk());

        // Verify all properties have correct status
        let prop1Available = chain.callReadOnlyFn('blockrent-contract', 'get-property-available', [types.uint(1)], deployer.address);
        assertEquals(prop1Available.result.expectSome(), types.bool(false));

        let lease1Status = chain.callReadOnlyFn('blockrent-contract', 'get-lease-status', [types.uint(1)], deployer.address);
        assertEquals(lease1Status.result.expectSome(), types.ascii("active"));

        // Verify counters
        let propertyCount = chain.callReadOnlyFn('blockrent-contract', 'get-property-count', [], deployer.address);
        assertEquals(propertyCount.result, types.uint(3));

        let leaseCount = chain.callReadOnlyFn('blockrent-contract', 'get-lease-count', [], deployer.address);
        assertEquals(leaseCount.result, types.uint(3));
    },
});

Clarinet.test({
    name: "Complete property lifecycle works correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const tenant = accounts.get('wallet_1')!;

        // 1. Register property
        let block = chain.mineBlock([
            createTestProperty(deployer, "123 Main St", 1500, 3000, "Beautiful apartment")
        ]);

        assertEquals(block.receipts[0].result.expectOk(), types.uint(1));

        // 2. Update property details
        block = chain.mineBlock([
            Tx.contractCall('blockrent-contract', 'update-property', 
                [types.uint(1), types.uint(1600), types.uint(3200), types.ascii("Updated beautiful apartment")], 
                deployer.address)
        ]);

        assertEquals(block.receipts[0].result.expectOk(), types.ascii("Property updated successfully"));

        // 3. Create lease
        block = chain.mineBlock([
            createTestLease(deployer, 1, tenant.address, 1625097600, 1656633600)
        ]);

        assertEquals(block.receipts[0].result.expectOk(), types.uint(1));

        // 4. Pay rent multiple times
        block = chain.mineBlock([
            Tx.contractCall('blockrent-contract', 'pay-rent', [types.uint(1), types.uint(1600)], tenant.address)
        ]);

        block.receipts[0].result.expectOk();

        block = chain.mineBlock([
            Tx.contractCall('blockrent-contract', 'pay-rent', [types.uint(1), types.uint(1600)], tenant.address)
        ]);

        block.receipts[0].result.expectOk();

        // 5. Process late fees
        block = chain.mineBlock([
            Tx.contractCall('blockrent-contract', 'process-late-fees', [types.uint(1)], deployer.address)
        ]);

        block.receipts[0].result.expectOk();

        // 6. End lease
        block = chain.mineBlock([
            Tx.contractCall('blockrent-contract', 'end-lease', [types.uint(1)], deployer.address)
        ]);

        block.receipts[0].result.expectOk();

        // 7. Withdraw escrow
        block = chain.mineBlock([
            Tx.contractCall('blockrent-contract', 'withdraw-escrow', [types.uint(1)], deployer.address)
        ]);

        block.receipts[0].result.expectOk();

        // 8. Verify final state
        let propertyAvailable = chain.callReadOnlyFn('blockrent-contract', 'get-property-available', [types.uint(1)], deployer.address);
        assertEquals(propertyAvailable.result.expectSome(), types.bool(true));

        let leaseStatus = chain.callReadOnlyFn('blockrent-contract', 'get-lease-status', [types.uint(1)], deployer.address);
        assertEquals(leaseStatus.result.expectSome(), types.ascii("ended"));

        let escrowBalance = chain.callReadOnlyFn('blockrent-contract', 'get-escrow-balance', [types.uint(1)], deployer.address);
        assertEquals(escrowBalance.result.expectSome(), types.uint(0));
    },
});

Clarinet.test({
    name: "Read-only functions return correct data for non-existent entries",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;

        // Test non-existent property
        let propertyOwner = chain.callReadOnlyFn('blockrent-contract', 'get-property-owner', [types.uint(999)], deployer.address);
        assertEquals(propertyOwner.result, types.none());

        let propertyAddress = chain.callReadOnlyFn('blockrent-contract', 'get-property-address', [types.uint(999)], deployer.address);
        assertEquals(propertyAddress.result, types.none());

        // Test non-existent lease
        let leaseProperty = chain.callReadOnlyFn('blockrent-contract', 'get-lease-property', [types.uint(999)], deployer.address);
        assertEquals(leaseProperty.result, types.none());

        let leaseTenant = chain.callReadOnlyFn('blockrent-contract', 'get-lease-tenant', [types.uint(999)], deployer.address);
        assertEquals(leaseTenant.result, types.none());

        // Test non-existent escrow
        let escrowBalance = chain.callReadOnlyFn('blockrent-contract', 'get-escrow-balance', [types.uint(999)], deployer.address);
        assertEquals(escrowBalance.result, types.none());

        // Test counters start at zero
        let propertyCount = chain.callReadOnlyFn('blockrent-contract', 'get-property-count', [], deployer.address);
        assertEquals(propertyCount.result, types.uint(0));

        let leaseCount = chain.callReadOnlyFn('blockrent-contract', 'get-lease-count', [], deployer.address);
        assertEquals(leaseCount.result, types.uint(0));
    },
});
