<?php

require_once 'TestHelper.php';
require_once(APP_DIR . '/OpenmixApplication.php');

class OpenmixApplicationTests extends PHPUnit_Framework_TestCase {
    /**
     * @test
     */
    public function init() {
        print("\nTesting init");
        $config = $this->getMock('Configuration');
        
        $call_index = 0;
        $config->expects($this->at($call_index++))
            ->method('declareInput')
            ->with(EDNSProperties::ENABLE);
            
        $config->expects($this->at($call_index++))
            ->method('declareInput')
            ->with(
                RadarProbeTypes::AVAILABILITY,
                'provider1,provider2,provider3');
            
        $config->expects($this->at($call_index++))
            ->method('declareInput')
            ->with(
                RadarProbeTypes::HTTP_RTT,
                'provider1,provider2,provider3');
            
        $config->expects($this->at($call_index++))
            ->method('declareInput')
            ->with(GeoProperties::MARKET);
            
        $config->expects($this->at($call_index++))
            ->method('declareInput')
            ->with(GeoProperties::COUNTRY);
            
        $config->expects($this->at($call_index++))
            ->method('declareInput')
            ->with(GeoProperties::ASN);
            
        $config->expects($this->at($call_index++))
            ->method('declareInput')
            ->with(EDNSProperties::ASN);
            
        $config->expects($this->at($call_index++))
            ->method('declareInput')
            ->with(EDNSProperties::COUNTRY);
            
        $config->expects($this->at($call_index++))
            ->method('declareInput')
            ->with(EDNSProperties::MARKET);
        
        $application = new OpenmixApplication();
        $application->init($config);
    }
    
    /**
     * @test
     */
    public function service() {
        print("\nTesting service");
        $test_data = array(
            array(
                'description' => 'no EDNS; no previous; all available; provider3 fastest',
                'get_key' => 'some key',
                'update_sticky_data_key' => 'some key',
                'rtt' => array( 'provider1' => 200, 'provider2' => 200, 'provider3' => 199 ),
                'avail' => array( 'provider1' => 80, 'provider2' => 80, 'provider3' => 80 ),
                'alias' => 'provider3',
                'reason' => 'B',
                'saved_after' => array(
                    'some key' => 'provider3',
                    'some other key' => 'some other alias'
                )
            ),
            array(
                'description' => 'EDNS; no previous; all available; provider3 fastest',
                'get_key' => 'some key',
                'update_sticky_data_key' => 'some key',
                'rtt' => array( 'provider1' => 200, 'provider2' => 200, 'provider3' => 199 ),
                'avail' => array( 'provider1' => 80, 'provider2' => 80, 'provider3' => 80 ),
                'alias' => 'provider3',
                'reason' => 'B',
                'saved_after' => array(
                    'some key' => 'provider3',
                    'some other key' => 'some other alias'
                )
            )
        );
        
        $test_index = 0;
        foreach ($test_data as $i) {
            print("\nTest: " . $test_index++);
            print("\nDescription: " . $i['description']);
            $request = $this->getMock('Request');
            $response = $this->getMock('Response');
            $utilities = $this->getMock('Utilities');
            $application = $this->getMock('OpenmixApplication', array('get_key', 'update_sticky_data'));
            
            $call_index = 0;
            $application_call_index = 0;
            
            $application->expects($this->at($application_call_index++))
                ->method('get_key')
                ->with($this->identicalTo($request))
                ->will($this->returnValue($i['get_key']));
            
            $application->expects($this->at($application_call_index++))
                ->method('update_sticky_data')
                ->with($i['update_sticky_data_key']);
            
            $request->expects($this->at($call_index++))
                ->method('radar')
                ->with(RadarProbeTypes::HTTP_RTT)
                ->will($this->returnValue($i['rtt']));
                
            if (array_key_exists('avail', $i)) {
                $request->expects($this->at($call_index++))
                    ->method('radar')
                    ->with(RadarProbeTypes::AVAILABILITY)
                    ->will($this->returnValue($i['avail']));
            }
            
            if (array_key_exists('alias', $i)) {
                $response->expects($this->once())
                    ->method('selectProvider')
                    ->with($i['alias']);
                    
                $utilities->expects($this->never())
                    ->method('selectRandom');
            }
            else {
                $response->expects($this->never())
                    ->method('selectProvider');
                    
                $utilities->expects($this->once())
                    ->method('selectRandom');
            }
            
            $response->expects($this->once())
                ->method('setReasonCode')
                ->with($i['reason']);
            
            // Pre-seed the application with sticky data
            $application->saved = array( 'some other key' => 'some other alias' );
            $application->freqtable = array( 'some other key' => 'some other microtime' );
            
            $application->service($request, $response, $utilities);
            $this->verifyMockObjects();
            
            // Further assertions
            $this->assertEquals($i['saved_after'], $application->saved);
        }
    }
    
    /**
     * @test
     */
    public function update_sticky_data() {
        print("\nTesting update_sticky_data");
        $test_data = array(
            array(
                'description' => 'temp',
                'key' => 'some key',
                'freqtable_before' => array(
                    'some other key' => 'some other microtime'
                ),
                'saved_before' => array(
                    'some other key' => 'some other alias'
                ),
                'entries_before' => 0,
                'entries_after' => 1,
                'saved_after' => array(
                    'some key' => null,
                    'some other key' => 'some other alias'
                ),
                'freqtable_after' => array(
                    'some key' => 'some microtime',
                    'some other key' => 'some other microtime'
                ),
            )
        );
        
        $test_index = 0;
        foreach ($test_data as $i) {
            print("\nTest: " . $test_index++);
            print("\nDescription: " . $i['description']);
            $application = $this->getMock('OpenmixApplication', array('get_microtime'));
            $application->freqtable = $i['freqtable_before'];
            $application->saved = $i['saved_before'];
            $application->entries = $i['entries_before'];
            
            $application->expects($this->once())
                ->method('get_microtime')
                ->will($this->returnValue('some microtime'));
            
            $application->update_sticky_data($i['key']);
            
            $this->assertEquals($i['entries_after'], $application->entries);
            $this->assertEquals($i['saved_after'], $application->saved);
            $this->assertEquals($i['freqtable_after'], $application->freqtable);
        }
    }
    
    /**
     * @test
     */
    public function get_key() {
        print("\nTesting get_key");
        $test_data = array(
            array(
                'description' => 'EDNS enabled',
                'edns_enable' => true,
                'market' => 'some market',
                'country' => 'some country',
                'asn' => 'some asn',
                'edns' => array(
                    'market' => 'some edns market',
                    'country' => 'some edns country',
                    'asn' => 'some edns asn',
                ),
                'result' => 'some edns market-some edns country-some edns asn'
            ),
            array(
                'description' => 'EDNS not enabled',
                'edns_enable' => false,
                'market' => 'some market',
                'country' => 'some country',
                'asn' => 'some asn',
                'result' => 'some market-some country-some asn'
            )
        );
        
        $test_index = 0;
        foreach ($test_data as $i) {
            print("\nTest: " . $test_index++);
            print("\nDescription: " . $i['description']);
            $request = $this->getMock('Request');
            $call_index = 0;
                
            $request->expects($this->at($call_index++))
                ->method('geo')
                ->with(GeoProperties::MARKET)
                ->will($this->returnValue($i['market']));
                    
            $request->expects($this->at($call_index++))
                ->method('geo')
                ->with(GeoProperties::COUNTRY)
                ->will($this->returnValue($i['country']));
                    
            $request->expects($this->at($call_index++))
                ->method('geo')
                ->with(GeoProperties::ASN)
                ->will($this->returnValue($i['asn']));
                
            $request->expects($this->at($call_index++))
                ->method('geo')
                ->with(EDNSProperties::ENABLE)
                ->will($this->returnValue($i['edns_enable']));
                
            if (array_key_exists('edns', $i)) {
                $request->expects($this->at($call_index++))
                    ->method('geo')
                    ->with(EDNSProperties::MARKET)
                    ->will($this->returnValue($i['edns']['market']));
                        
                $request->expects($this->at($call_index++))
                    ->method('geo')
                    ->with(EDNSProperties::COUNTRY)
                    ->will($this->returnValue($i['edns']['country']));
                    
                $request->expects($this->at($call_index++))
                    ->method('geo')
                    ->with(EDNSProperties::ASN)
                    ->will($this->returnValue($i['edns']['asn']));
            }
            $application = new OpenmixApplication();
            
            // Code under test
            $result = $application->get_key($request);
            
            // Assertions
            $this->assertEquals($i['result'], $result);
        }
    }
}
?>