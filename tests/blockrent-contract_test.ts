
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
